#!/usr/bin/env bash
set -euo pipefail
nvidia-smi -L
cat <<'TXT'

RassyGPT default lane map:
  general   -> GPU-da459626-429e-72e2-1fe9-b08d791ff949  V100 32GB
  coder     -> GPU-c7937378-74e4-b9ab-1953-342773d4e962, GPU-d48ccf91-1518-72fa-b13a-73cb480788e2  V100 16GB + 16GB
  fast      -> GPU-aa4fe9a9-bc80-df98-ea0f-0d152446d84c  P40 24GB
  worker    -> GPU-c83f333f-e104-7d4c-b1c1-e0d2e8818053  V100 12GB, secondary coder
  retrieval -> GPU-e1d104e4-bdf8-8558-a863-fa50b1168122  P100 16GB
  media     -> GPU-b9b6fa94-347e-3b4d-d920-8627b0ef5897  RTX 2080 Ti, image + STT/TTS
  excluded  -> GPU-787cf3b9-e1d7-1712-bd12-60cf740bade8  M40 24GB, do not assign to RassyGPT
TXT
