# Dungeon Master

The existing server-authoritative campaign API remains under `/api/dm/*`. The public
application is `/dungeon-master`; `/dm` remains a compatibility shortcut. Production
authentication requires a real `DM_JWT_SECRET` supplied by the Runtipi environment.

Product invariant: RassyMind is always the Dungeon Master. Human accounts are players;
characters are the only actors in the fiction. The campaign creator role is an ownership
and invitation permission, not a second human Dungeon Master.
