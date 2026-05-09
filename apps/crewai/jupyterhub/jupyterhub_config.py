import os

c = get_config()

# Network
c.JupyterHub.bind_url = "http://0.0.0.0:8888"

# Persist hub state
c.JupyterHub.db_url = "sqlite:////data/jupyterhub/jupyterhub.sqlite"
c.JupyterHub.cookie_secret_file = "/data/jupyterhub/jupyterhub_cookie_secret"

# Admins can access user servers if needed
c.JupyterHub.admin_access = True

# Default to JupyterLab
c.Spawner.default_url = "/lab"

# Restrict logins to explicitly allowed users
allowed = os.environ.get("JUPYTERHUB_ALLOWED_USERS", "")
if allowed:
    c.Authenticator.allowed_users = {u.strip() for u in allowed.split(",") if u.strip()}

admins = os.environ.get("JUPYTERHUB_ADMIN_USERS", "")
if admins:
    c.Authenticator.admin_users = {u.strip() for u in admins.split(",") if u.strip()}

c.Authenticator.allow_all = False
