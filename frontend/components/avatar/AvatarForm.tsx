"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api";
import { avatarImageUrl } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { errorMessage } from "@/lib/errors";
import type { Avatar } from "@/lib/types";

const MAX_IMAGE_MB = 5;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Create a new avatar, or edit an existing one when `avatar` is given. */
export default function AvatarForm({ avatar }: { avatar?: Avatar }) {
  const router = useRouter();
  const { upsertAvatar } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(avatar);

  const [name, setName] = useState(avatar?.name ?? "");
  const [description, setDescription] = useState(avatar?.description ?? "");
  const [personality, setPersonality] = useState(avatar?.personality ?? "");
  const [speakingStyle, setSpeakingStyle] = useState(avatar?.speaking_style ?? "");
  const [expertise, setExpertise] = useState(avatar?.expertise ?? "");
  const [tagsInput, setTagsInput] = useState(avatar?.topic_tags.join(", ") ?? "");
  const [imagePreview, setImagePreview] = useState<string | null>(avatar ? avatarImageUrl(avatar) : null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Please choose a PNG, JPG, WEBP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`That image is larger than ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setError(null);
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const fields: api.AvatarFields = {
      name: name.trim(),
      description,
      personality,
      speaking_style: speakingStyle,
      expertise,
      topic_tags: tagsInput
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    };

    try {
      if (avatar) {
        let saved = await api.updateAvatar(avatar.id, fields);
        if (imageFile) saved = await api.replaceAvatarImage(avatar.id, imageFile);
        else if (removeImage && avatar.image_path) saved = await api.removeAvatarImage(avatar.id);
        upsertAvatar(saved);
        router.push(`/chat/${avatar.id}`);
      } else {
        const form = new FormData();
        form.append("name", fields.name);
        form.append("description", fields.description);
        form.append("personality", fields.personality);
        form.append("speaking_style", fields.speaking_style);
        form.append("expertise", fields.expertise);
        form.append("topic_tags", JSON.stringify(fields.topic_tags));
        if (imageFile) form.append("image", imageFile);
        const created = await api.createAvatar(form);
        upsertAvatar(created);
        router.push(`/chat/${created.id}`);
      }
    } catch (err) {
      setError(errorMessage(err, editing ? "Failed to save changes." : "Failed to create avatar."));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6 p-6 shadow-[0_1px_2px_rgba(20,23,31,0.04),0_8px_24px_rgba(20,23,31,0.05)] sm:p-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-paper text-xs text-ink-muted transition hover:border-accent"
          aria-label={imagePreview ? "Change avatar image" : "Upload avatar image"}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-full w-full object-cover" />
          ) : (
            "Upload"
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={handleImageChange}
        />
        <div className="text-sm text-ink-muted">
          <p>Avatar image — PNG, JPG, WEBP, or GIF, up to {MAX_IMAGE_MB} MB.</p>
          {imagePreview && (
            <button type="button" onClick={clearImage} className="mt-1 text-xs font-medium text-accent hover:underline">
              Remove image
            </button>
          )}
        </div>
      </div>

      <Field label="Name" required>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Professor Ada" maxLength={100} className="field" />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who is this persona? Background, role, context..."
          rows={3}
          className="field"
        />
      </Field>

      <Field label="Personality">
        <textarea
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          placeholder="e.g. Warm, patient, curious, a bit witty"
          rows={2}
          className="field"
        />
      </Field>

      <Field label="Speaking Style">
        <textarea
          value={speakingStyle}
          onChange={(e) => setSpeakingStyle(e.target.value)}
          placeholder="e.g. Uses analogies, asks Socratic questions, casual tone"
          rows={2}
          className="field"
        />
      </Field>

      <Field label="Expertise">
        <input
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          placeholder="e.g. Linear algebra, machine learning"
          className="field"
        />
      </Field>

      <Field label="Topic Tags" hint="Comma-separated. Your mastery of these is tracked on the Knowledge Dashboard.">
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. eigenvalues, gradient descent, neural networks"
          className="field"
        />
      </Field>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        {editing && (
          <button type="button" onClick={() => router.back()} className="btn-secondary sm:w-40">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? (editing ? "Saving..." : "Creating...") : editing ? "Save changes" : "Create Avatar"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label} {required && <span className="text-accent2">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}
