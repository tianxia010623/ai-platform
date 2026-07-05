# Test Report

## Date
2026-07-05

## Tester
Liz｜Tianxia

## Scope
Full local run of frontend + backend, verifying signup, login, avatar creation, and chat functionality.

## Environment
- Backend: Python 3.13.9, FastAPI, uvicorn --reload
- Frontend: Next.js 14.2.15, npm run dev
- Database: SQLite (auto-generated locally)

## Results

| Feature | Status | Notes |
|---|---|---|
| Sign up / Login | Pass | Flow works as expected |
| Create Avatar (/avatar/new) | Pass | Form fields work, avatar created successfully |
| Chat | Fail | See bugs below |

## Bugs Found

### Bug #1: API Key Not Configured
- **Symptom**: Chat request fails with `401 - invalid x-api-key`
- **Cause**: `backend/.env` had a placeholder value for `ANTHROPIC_API_KEY` instead of a real key
- **Status**: Resolved after teammate provided the real key

### Bug #2: Insufficient Anthropic Account Balance
- **Symptom**: After adding the real key, chat fails with `400 - Your credit balance is too low to access the Anthropic API`
- **Cause**: Anthropic account has insufficient credit
- **Status**: Open — requires teammate to top up via console.anthropic.com Billing page
- **Impact**: Core chat feature cannot currently be verified; highest-priority blocker

## To Do
- [ ] Teammate to top up Anthropic account credit
- [ ] Re-test full chat flow (including file upload) once resolved
- [ ] Test Dashboard page