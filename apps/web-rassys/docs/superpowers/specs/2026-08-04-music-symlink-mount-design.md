# Music Symlink Mount Design

## Goal

Make the Rassys music library available when `/data/runtipi/media/data/music` contains symlinked directories whose targets live under `/mnt/cannonball`.

## Current cause

The radio controller and Liquidsoap containers mount `/data/runtipi/media/data/music` at `/media/music`, and the scanner already follows directory symlinks. The host music directory contains links such as `Unsorted -> /mnt/cannonball/music/Unsorted`, but `/mnt/cannonball` is not mounted inside either container. The links therefore resolve to missing paths in the containers and the scanner reports zero tracks.

## Design

Add a read-only bind mount from the host's `/mnt/cannonball` to the same absolute path, `/mnt/cannonball`, in both `radio-controller` and `liquidsoap`. Keeping the path identical preserves the existing absolute symlink targets. The mount remains read-only and is limited to the two services that scan or play music.

No scanner changes are needed: `collectAudioFiles` already resolves symlink targets, follows symlinked directories, tracks visited real directories to avoid loops, and skips broken links without failing the scan.

## Verification

1. Add a static Compose regression test that requires the `/mnt/cannonball:/mnt/cannonball:ro` mount in both services.
2. Run the focused test and the existing radio-controller test suite.
3. Recreate the deployed app so the new bind mount is present.
4. Verify from both containers that `/media/music/Unsorted` resolves and contains audio files.
5. Trigger/observe a library scan and verify the controller reports a nonzero track count and the radio service is healthy.

## Scope and safety

This change does not alter, copy, move, or delete any media. It exposes the existing host directory read-only to the two already-authorized media services. Existing unrelated working-tree changes remain untouched.
