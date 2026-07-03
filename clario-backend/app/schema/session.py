from pydantic import BaseModel


class SessionStartData(BaseModel):
    session_id: str
    user_id: str
    created_at: str
