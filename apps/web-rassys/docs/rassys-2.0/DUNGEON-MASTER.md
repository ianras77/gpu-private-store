# Dungeon Master

The existing server-authoritative campaign API remains under `/api/dm/*`. The public
application is `/dungeon-master`; `/dm` remains a compatibility shortcut. Production
authentication requires a real `DM_JWT_SECRET` supplied by the Runtipi environment.
