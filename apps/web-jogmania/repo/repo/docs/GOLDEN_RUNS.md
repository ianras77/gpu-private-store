# Jogmania golden run review set

This is a human review set for the “it knows my run” and “it is fun” promises. All runner histories below are synthetic. Each personal observation must use one of the listed evidence IDs; a missing or noisy signal calls for a warm general story with no personal claim.

| Runner shape | Evidence Jogmania may use | A good moment | A miss |
|---|---|---|---|
| First visit | `first-adventure`, `course-discovery`, `chosen-intention` | A welcome to the new trail and the runner's chosen kind of outing | Calling the runner a beginner or guessing how the run felt |
| Happy course repeater | `course-return`, `favorite-course` | A familiar friend or place remembers the runner | Repeating distance and time as the whole recap |
| Curious explorer | `course-discovery`, `recent-running-rhythm` | A newly found map corner beside a gentle recent-history observation | Saying the new route was harder, better, or faster |
| Gentle-day chooser | `chosen-intention` | A relaxed, playful story that treats “easy” as a complete adventure | A bonus that requires more distance, speed, or heart rate |
| Welcome-back runner | `welcome-back` | A friendly saved-seat moment, with no missed-day guilt | Mentioning a broken streak or lost progress |
| Long-course return | `longest-course-wander`, `course-return` | A trail-sized postcard and one true comparison with the runner's own earlier visits | Comparing the runner with another person |
| Irregular schedule | `recent-running-pattern`, `welcome-back` when supported | A kind observation that leaves room for real life | Treating an irregular schedule as failure or a problem to fix |
| No health-data consent | `run-complete`, course and intention evidence | Full sparks, events, and story from route/session data alone | Asking for HR or calories to make the run count |
| Missing or noisy GPS | `run-complete`, `chosen-intention` | A simpler cabinet story and ordinary run save | Pinning a beat to a location or inventing a climb/turn |
| Feedback asks for grounded or shorter copy | Any verified evidence selected by the runner | Follow the saved correction on the next postcard | Repeating the same voice after the runner corrected it |

## Review questions

- Can a first-time runner understand the mission without learning game vocabulary?
- Does the observation point to a real run or preference, and can a reviewer follow its evidence ID?
- Does a short, gentle, or no-heart-rate run still receive a complete story and useful progression?
- Does every course and pace band have a fair path to keepsakes, levels, and world change?
- Does a returning runner feel welcomed, never graded?
- Can a runner correct the storyteller and see that correction shape a later mission?

For release review, collect anonymized outputs for these ten shapes with network fallback enabled and disabled. A claim without an allowed evidence ID, a health or exertion suggestion, a missed-run penalty, or a repeated generic stats summary is a failing result. Physical Watch readability, battery, audio/haptic comfort, and delight ratings still require runners on a paired device.

The API regression suite exercises two hard failures from this review set: an invented evidence ID must use the deterministic fallback, and exertion advice must be replaced with the saved fallback line even when the model selected an allowed evidence ID. The Mastra golden smoke starts the actual workflow server against a deterministic OpenAI-compatible fixture and verifies the trend, cartridge, and recap output schemas plus evidence and event IDs. That proves workflow wiring and output contracts, but it does not prove that a configured model writes delightful stories.

The deployed Jogmania Mastra service is configured and its live Worldkeeper request reaches RassyMind, but the gateway returns a retryable `context_accounting_unavailable` 503 before generation completes. The ten runner shapes above still need a real-model review before claiming voice quality. Keep deterministic fallbacks enabled until that gateway issue is resolved and outputs pass review. Watch readability, battery use, audio and haptic comfort, and delight also require a paired Apple Watch.
