from supabase import Client, ClientOptions, create_client

from app.auth import CurrentUser
from app.config import Settings
from app.errors import ApiError


def create_user_supabase_client(settings: Settings, user: CurrentUser) -> Client:
    client = create_client(
        settings.supabase_url,
        settings.supabase_publishable_key,
        options=ClientOptions(headers={"Authorization": f"Bearer {user.access_token}"}),
    )
    client.postgrest.auth(user.access_token)
    return client


def create_admin_supabase_client(settings: Settings) -> Client:
    admin_key = settings.supabase_secret_key
    if not admin_key:
        raise ApiError(
            503, "admin_client_unavailable", "The administrative Supabase client is not configured."
        )
    return create_client(settings.supabase_url, admin_key)
