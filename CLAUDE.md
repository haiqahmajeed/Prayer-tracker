# Lead Management System — CLAUDE.md

## Project Overview

A REST API for managing sales leads, built with **FastAPI** and **PostgreSQL**.
FastAPI was chosen because it auto-generates interactive API docs (Swagger UI at `/docs`),
has built-in data validation via Pydantic, and is easy to learn while being production-ready.
PostgreSQL was chosen as a reliable, widely-supported relational database that handles
structured lead data (names, emails, statuses, notes) well.

---

## Project Structure

```
lead-management/
├── app/
│   ├── main.py          # FastAPI app entry point
│   ├── database.py      # Database connection setup
│   ├── models.py        # SQLAlchemy table definitions (what the DB looks like)
│   ├── schemas.py       # Pydantic models (what the API accepts/returns)
│   ├── routers/
│   │   └── leads.py     # All /leads endpoints
│   └── crud.py          # Database query functions (Create, Read, Update, Delete)
├── alembic/             # Database migrations (version-controlled schema changes)
├── tests/
│   └── test_leads.py
├── .env                 # Local secrets — NEVER commit this file
├── .env.example         # Safe template showing required env vars (no real values)
├── requirements.txt
└── CLAUDE.md
```

**Why this structure?** Separating `models.py` (DB shape) from `schemas.py` (API shape)
keeps the database layer decoupled from the API layer. This means you can change what
you store without breaking what your API returns, and vice versa.

---

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.11+ | Language |
| FastAPI | 0.111+ | Web framework |
| SQLAlchemy | 2.0+ | ORM (talk to PostgreSQL in Python) |
| Alembic | 1.13+ | Database migrations |
| Pydantic | 2.0+ | Data validation and serialization |
| psycopg2 | 2.9+ | PostgreSQL driver |
| python-dotenv | 1.0+ | Load secrets from `.env` file |
| pytest | 8.0+ | Testing |

---

## Environment Variables

All secrets and environment-specific config live in a `.env` file that is **never committed**.

Required variables (copy `.env.example` and fill in real values):

```
DATABASE_URL=postgresql://user:password@localhost:5432/leads_db
SECRET_KEY=your-random-secret-key
ENVIRONMENT=development
```

**Rule: never hardcode secrets in source code.** Always read them via `os.getenv()` or
`python-dotenv`. If you accidentally commit a secret, rotate it immediately.

---

## Database Setup

```bash
# Create the database
createdb leads_db

# Install dependencies
pip install -r requirements.txt

# Run migrations to create tables
alembic upgrade head
```

**Why Alembic for migrations?** Instead of manually running SQL to change tables,
Alembic tracks schema changes in version-controlled files. This means every developer
and every environment applies the same changes in the same order — no surprises.

---

## Running the App

```bash
# Development server with auto-reload
uvicorn app.main:app --reload

# API docs are available at:
# http://localhost:8000/docs      (Swagger UI — interactive)
# http://localhost:8000/redoc     (ReDoc — readable)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/leads` | List all leads (supports `?status=` filter) |
| `POST` | `/leads` | Create a new lead |
| `GET` | `/leads/{id}` | Get a single lead |
| `PUT` | `/leads/{id}` | Update a lead |
| `DELETE` | `/leads/{id}` | Delete a lead |

---

## Lead Data Shape

A lead has these fields:

```python
# What you send when creating a lead (schemas.py)
class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    company: str | None = None
    status: str = "new"   # new | contacted | qualified | lost | won
    notes: str | None = None
```

**Why Pydantic for validation?** FastAPI uses Pydantic to automatically validate incoming
JSON. If a required field is missing or an email is malformed, the API returns a clear
error message — you don't need to write that validation logic yourself.

---

## Coding Rules

### Keep it beginner-friendly
- Write simple, readable code over clever one-liners.
- Name variables and functions clearly — `get_lead_by_id` not `get_l`.
- Add a one-line comment only when the *why* is not obvious from the code itself.
- Avoid deep nesting — break complex logic into small, named functions.

### Explain architectural decisions
- When adding a new pattern (a new router, middleware, background task), add a brief
  note in this file explaining why it was introduced.
- Leave a short inline comment on any non-obvious architectural choice in the code.

### Never expose secrets
- Never put passwords, API keys, or tokens in source code.
- Never log request bodies that might contain sensitive data.
- Never return passwords or internal IDs in API responses.
- The `.env` file is in `.gitignore` — keep it there.

### Database access
- All DB queries go in `crud.py`, not inside routers or endpoints.
- Always use parameterized queries (SQLAlchemy handles this) — never format SQL strings
  directly with user input, as that causes SQL injection vulnerabilities.
- Use dependency injection (`Depends(get_db)`) to manage database sessions per request.

### Error handling
- Return appropriate HTTP status codes: `404` for not found, `422` for validation errors,
  `500` only for unexpected server errors.
- Use `HTTPException` from FastAPI — don't let raw Python exceptions bubble up to users.

---

## Running Tests

```bash
pytest tests/ -v
```

Tests use a separate test database configured via `DATABASE_URL` in a `.env.test` file.
Never run tests against the production database.

---

## Common Patterns

### Adding a new endpoint

1. Add the route function in `app/routers/leads.py`
2. Add the DB query in `app/crud.py`
3. Add or update Pydantic schemas in `app/schemas.py`
4. If the DB schema changed, create a migration: `alembic revision --autogenerate -m "describe change"`
5. Write a test in `tests/test_leads.py`

### Creating a migration

```bash
# After changing models.py
alembic revision --autogenerate -m "add phone column to leads"
alembic upgrade head
```

Always review the generated migration file before running it — autogenerate is not perfect.
