from contextlib import asynccontextmanager

from fastapi import FastAPI

from apps.api.app.api.routes import assets, auth, diagnosis, jobs, placeholders, reminders, system, trademarks
from apps.api.app.core.database import Base, engine
from apps.api.app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


configure_logging()
app = FastAPI(title="A1+ IP Coworker API", lifespan=lifespan)


app.include_router(auth.router)
app.include_router(diagnosis.router)
app.include_router(trademarks.router)
app.include_router(assets.router)
app.include_router(reminders.router)
app.include_router(jobs.router)
app.include_router(placeholders.router)
app.include_router(system.router)
