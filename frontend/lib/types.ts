export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface Avatar {
  id: number;
  user_id: number;
  name: string;
  description: string;
  personality: string;
  speaking_style: string;
  expertise: string;
  topic_tags: string[];
  image_path: string | null;
  system_prompt: string;
  created_at: string;
}

export interface ChatSession {
  id: number;
  user_id: number;
  avatar_id: number;
  title: string;
  created_at: string;
}

export interface Message {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  attached_files: { filename: string }[];
  created_at: string;
}

export interface TopicMastery {
  id: number;
  avatar_id: number;
  topic: string;
  mastery_score: number;
  interaction_count: number;
  last_topics_summary: string;
  updated_at: string;
}

export interface MessageFeedback {
  id: number;
  message_id: number;
  user_id: number;
  rating: number;
  created_at: string;
}
