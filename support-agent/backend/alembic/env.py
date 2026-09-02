from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings
from app.db.models import Base

config = context.config

# Both Supabase (primary) and the local standby need the schema —
# failover only actually works at request time if the local copy
# already has every table the app expects. Run against primary by
# default; `alembic -x db=local upgrade head` targets the standby
# instead — see the Dockerfile, which runs both on every container
# start.
x_args = context.get_x_argument(as_dictionary=True)
target_url = settings.local_database_url if x_args.get("db") == "local" else settings.database_url
config.set_main_option("sqlalchemy.url", target_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# Both Supabase and the local standby also hold the main United-Services
# backend's own Prisma-managed tables (User, Ticket, AllowedOrigin,
# etc. — same database, different app, different migration tool). Without
# this filter, `alembic revision --autogenerate` compares the *entire*
# database schema against this app's own Base.metadata and proposes
# DROP TABLE for every single Prisma table it finds that isn't in our
# metadata — confirmed live: a real autogenerate run against the actual
# Supabase database generated a migration that would have dropped all 22
# of the main backend's tables, caught by reading the generated file
# before ever applying it, not by this filter (which didn't exist yet at
# the time). This is that filter, added afterward so it can't happen
# again: skip any reflected table (exists in the DB, "reflected=True")
# that isn't one this app actually defines a model for.
def _include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=target_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=_include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
