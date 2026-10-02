# Collaborative Code Review Platform

An API-driven service that lets development teams submit code, request reviews, and collaborate through inline comments, structured approvals, and real-time notifications — an alternative to noisy pull-request threads.

## Tech Stack

* **Backend:** Node.js, Express, TypeScript
* **Database:** PostgreSQL
* **Auth:** JWT (JSON Web Tokens), bcrypt password hashing
* **Real-time:** Socket.IO (WebSockets)

## Getting Started

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your own values.
3. Create the database and run the schema in `database/schema.sql` using pgAdmin or `psql`.
4. Start the dev server:
   ```bash
   npm run dev
   ```
   The API runs on `http://localhost:3000`.

## Authentication

* **POST** `/api/auth/register` — Create an account (name, email, password, role)
* **POST** `/api/auth/login` — Log in and receive a JWT
* **GET** `/api/me` — Get the currently authenticated user

## Users

* **GET** `/api/users/:id` — View a user's profile
* **PATCH** `/api/users/:id` — Update your own profile
* **GET** `/api/users/:id/notifications` — View your activity feed

## Projects

* **POST** `/api/projects` — Create a project
* **GET** `/api/projects` — List projects you belong to
* **POST** `/api/projects/:id/members` — Add a member (owner only)
* **DELETE** `/api/projects/:id/members/:userId` — Remove a member (owner only)
* **GET** `/api/projects/:id/submissions` — List submissions in a project
* **GET** `/api/projects/:id/stats` — View project statistics

## Submissions

* **POST** `/api/submissions` — Create a submission
* **GET** `/api/submissions/:id` — View a single submission
* **PATCH** `/api/submissions/:id/status` — Update status (reviewer only)
* **DELETE** `/api/submissions/:id` — Delete your own submission
* **POST** `/api/submissions/:id/approve` — Approve a submission (reviewer only)
* **POST** `/api/submissions/:id/request-changes` — Request changes (reviewer only)
* **GET** `/api/submissions/:id/reviews` — View review history

## Comments

* **POST** `/api/submissions/:id/comments` — Add a comment (reviewer only)
* **GET** `/api/submissions/:id/comments` — List comments on a submission
* **PATCH** `/api/comments/:id` — Edit your own comment
* **DELETE** `/api/comments/:id` — Delete your own comment

## Real-Time Updates

The server runs a Socket.IO instance alongside the REST API. When a comment is created, a `new_comment` event is broadcast to all connected clients. A test client is available at `public/websocket-test.html` once the server is running.

## Authorization Model

* **Reviewer / Submitter roles** — only reviewers can comment, approve, or request changes.
* **Project ownership** — only the owner can add or remove project members.
* **Resource ownership** — users can only edit or delete their own profile, submissions, and comments.

## Known Limitations

* Centralized validation (`requireFields`) and error handling (`asyncHandler`) middleware is implemented and applied to the authentication and user routes; rolling it out to every route is ongoing.
* No automated test suite yet (manual testing was done via Postman throughout development).

## Author

Built by Thulile as a learning project covering full-stack API development: authentication, relational data modeling, authorization, and real-time communication.
