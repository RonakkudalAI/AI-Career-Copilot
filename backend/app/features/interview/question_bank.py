"""Deterministic interview questions for common, explicitly evidenced skills."""

from __future__ import annotations

import re

Question = tuple[str, str]
_NORMALIZE = re.compile(r"[^a-z0-9+#.]+")


def normalize_skill(value: str) -> str:
    return _NORMALIZE.sub(" ", str(value or "").casefold().replace(".", " ")).strip()


QUESTION_BANK: dict[str, list[Question]] = {
    "python": [
        ("Explain Python decorators and one practical use case.", "medium"),
        ("When would you use a generator instead of a list?", "easy"),
    ],
    "fastapi": [
        ("Explain dependency injection in FastAPI and how you would test it.", "medium"),
        ("How does Pydantic protect an API boundary?", "medium"),
    ],
    "docker": [("Describe the difference between a Docker image and a container.", "easy")],
    "git": [("Explain how you would resolve a merge conflict safely.", "easy")],
    "sql": [("How would you diagnose and improve a slow SQL query?", "medium")],
    "postgresql": [("How would you choose an index for a frequently filtered query?", "medium")],
    "javascript": [("Explain the event loop and its effect on asynchronous JavaScript.", "medium")],
    "typescript": [("How do TypeScript types improve reliability at an API boundary?", "easy")],
    "react": [("How do you decide between local state, context, and server state?", "medium")],
    "next js": [("When would you render a Next.js route on the server versus the client?", "medium")],
    "aws": [("How would you design least-privilege access for an application on AWS?", "medium")],
    "kubernetes": [("How do deployments, services, and ingress work together?", "medium")],
    "machine learning": [("How would you detect and respond to model overfitting?", "medium")],
    "tensorflow": [("How would you make a TensorFlow training pipeline reproducible?", "medium")],
    "pytorch": [("How do datasets and data loaders support scalable PyTorch training?", "medium")],
}


def questions_for(skill: str, limit: int = 2) -> list[Question]:
    return QUESTION_BANK.get(normalize_skill(skill), [])[:limit]


def has_questions(skill: str) -> bool:
    return bool(questions_for(skill, 1))
