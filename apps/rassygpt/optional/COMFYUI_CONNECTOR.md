# Optional ComfyUI connector notes
# RassyGPT intentionally does not ship ComfyUI in the core app because image stacks change quickly.
# To connect an existing ComfyUI/OpenAI-compatible image gateway, set:
# RASSYGPT_IMAGE_BACKEND_URL=http://your-image-gateway:PORT
#
# ComfyUI's native API uses /prompt, /history, and /queue rather than OpenAI's image route,
# so place a ComfyUI-to-OpenAI bridge between RassyGPT and ComfyUI for /v1/images/generations.
