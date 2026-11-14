from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:password@127.0.0.1:3306/medicine_inventory?charset=utf8mb4"
    app_username: str = ""
    app_password_hash: str = ""
    token_secret: str = ""
    token_ttl_minutes: int = 480
    cors_origins: str = ""
    app_env: str = "development"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
