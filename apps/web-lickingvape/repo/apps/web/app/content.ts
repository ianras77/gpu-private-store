import type { Post } from './types';

const now = Date.now();
const isoMinutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export type SearchSignal = {
  kicker: string;
  title: string;
  description: string;
  query: string;
};

export type ToolCard = {
  kicker: string;
  title: string;
  description: string;
  href: string;
  cta: string;
};

export type EditorialPrompt = {
  label: string;
  seed: string;
};

export type ChatMode = {
  id: 'craving' | 'post' | 'reset' | 'world';
  label: string;
  description: string;
  prompt: string;
};

export const buildRasiesSearchHref = (query: string) =>
  `https://search.rasies.com/search?q=${encodeURIComponent(query)}&language=en-US&safesearch=0`;

export const starterPosts: Post[] = [
  {
    id: -1,
    author_type: 'web',
    display_name: 'inkblot',
    body: 'I was not craving a vape. I was craving the little exit door it pretended to be. Posted here, drank cold water, let the exit door stay painted on the wall.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 5),
    published_at: isoMinutesAgo(60 * 24 * 5),
    tags: ['craving', 'exit-door', 'held-on']
  },
  {
    id: -2,
    author_type: 'web',
    display_name: null,
    body: 'After dinner is my striped villain. Tonight I named it, washed one pan, folded one towel, and did not drive to the gas station. Boring magic counts.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 4 + 80),
    published_at: isoMinutesAgo(60 * 24 * 4 + 80),
    tags: ['after-dinner', 'hands-busy', 'boring-magic']
  },
  {
    id: -3,
    author_type: 'web',
    display_name: 'smokeghost',
    body: 'Slip report with no funeral music: I hit one yesterday, hated the taste, told the wall, reset the route home. Shame did not get a throne.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 4 + 240),
    published_at: isoMinutesAgo(60 * 24 * 4 + 240),
    tags: ['slip', 'reset', 'no-throne']
  },
  {
    id: -4,
    author_type: 'web',
    display_name: 'J',
    body: 'Thirty little tigers in my teeth today. I only had to outlast the first one. The rest got bored when I changed rooms.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 3 + 30),
    published_at: isoMinutesAgo(60 * 24 * 3 + 30),
    tags: ['stripe-one', 'change-rooms', 'tiny-win']
  },
  {
    id: -5,
    author_type: 'admin',
    display_name: 'night desk',
    body: 'Wall prompt: write the exact sentence nicotine is whispering, then answer it like you are tired of its handwriting.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 2 + 210),
    published_at: isoMinutesAgo(60 * 24 * 2 + 210),
    tags: ['wall-prompt', 'reply-back']
  },
  {
    id: -6,
    author_type: 'web',
    display_name: 'thinmoon',
    body: 'My mouth wanted a task. Mint, straw, terrible playlist. My brain complained in rhyme and then forgot what it wanted.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 2 + 480),
    published_at: isoMinutesAgo(60 * 24 * 2 + 480),
    tags: ['mouth-habit', 'ritual-swap', 'playlist']
  },
  {
    id: -7,
    author_type: 'web',
    display_name: 'T',
    body: 'The group chat got loud. I wanted the old pocket lightning. Put the phone on the floor and stood outside until the want became weather.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 + 90),
    published_at: isoMinutesAgo(60 * 24 + 90),
    tags: ['friends', 'weather', 'still-here']
  },
  {
    id: -8,
    author_type: 'web',
    display_name: null,
    body: 'Morning one before coffee. I did not become graceful. I did become nicotine-free for one more ugly hour.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 18),
    published_at: isoMinutesAgo(60 * 18),
    tags: ['day-one', 'morning', 'ugly-hour']
  },
  {
    id: -9,
    author_type: 'web',
    display_name: 'L',
    body: 'Grounding for bad-news days: headline, feeling, object. The headline is not in my kitchen. The feeling is not a command. The spoon is real.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 12),
    published_at: isoMinutesAgo(60 * 12),
    tags: ['doomscroll', 'grounding', 'object-real']
  },
  {
    id: -10,
    author_type: 'web',
    display_name: 'A',
    body: 'Deleted the delivery app because my willpower is a candle in a windy cartoon hallway. Architecture beats vibes tonight.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 8),
    published_at: isoMinutesAgo(60 * 8),
    tags: ['friction', 'architecture', 'cartoon-hallway']
  },
  {
    id: -11,
    author_type: 'web',
    display_name: 'C',
    body: 'Texted a friend: if I ask for a hit, say no and remind me I am being theatrical. Outsourcing the spine a little.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 5),
    published_at: isoMinutesAgo(60 * 5),
    tags: ['support', 'boundary', 'theatrical']
  },
  {
    id: -12,
    author_type: 'web',
    display_name: null,
    body: 'Current plan: survive the night, keep the window open, let tomorrow arrive without nicotine on my tongue.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 2),
    published_at: isoMinutesAgo(60 * 2),
    tags: ['night', 'plan', 'still-here']
  }
];

export const homeHighlights = [
  {
    title: 'Anon wall first.',
    description:
      'The feed is the product: cravings, slips, little wins, mouth-habit grief, and the odd sentence that gets you through the hour.'
  },
  {
    title: 'Moderated, not polished flat.',
    description:
      'The LLM reviewer and the night desk catch spam, cruelty, PII, and crisis signals while leaving the honest voice intact.'
  },
  {
    title: 'Specific help when the wall is not enough.',
    description:
      'The Stripe Scribe has modes for cravings, draft help, slip resets, and doomscroll grounding instead of a generic support chatbot.'
  }
];

export const moodStickers = [
  'anonymous wall',
  'dark storybook nicotine exit',
  'modern sideblog energy',
  'one stripe at a time'
];

export const tickerLines = [
  'post before the craving gets a costume',
  'thirty striped urges, one tiny refusal',
  'anonymous counts as honest',
  'no shame throne tonight',
  'the wall is awake',
  'craving / trigger / next move'
];

export const editorialLanes = [
  {
    title: 'Craving reports',
    description:
      'The body scene, the bargaining voice, the tiny interruption, the strange replacement ritual.'
  },
  {
    title: 'Slip receipts',
    description:
      'What happened, what lit it, what changes next, without turning one hit into a whole identity.'
  },
  {
    title: 'World noise',
    description:
      'Headlines, money stress, social pressure, boredom, grief, and the tab stack that makes nicotine look useful.'
  }
];

export const howItWorks = [
  {
    title: 'Write the scene',
    description:
      'One paragraph is enough: what happened, what the urge promised, what you did before it owned the room.'
  },
  {
    title: 'The desk reviews it',
    description:
      'Automated policy checks and optional LLM review keep the wall anonymous, human, and safer to read.'
  },
  {
    title: 'The room answers by existing',
    description:
      'People see the note, recognize the hour, and get proof that the next stripe can be smaller.'
  }
];

export const toolCabinet: ToolCard[] = [
  {
    kicker: 'Post box',
    title: 'Leave a wall note',
    description:
      'Fast lane for cravings, slips, tiny victories, and the sentence you need to say before nicotine speaks for you.',
    href: '/submit',
    cta: 'Open the post box'
  },
  {
    kicker: 'Scribe',
    title: 'Talk to the Stripe Scribe',
    description:
      'Mode-based chat for cravings, draft shaping, slip reset, and doomscroll grounding. It remembers your thread if you sign in.',
    href: '/#scribe',
    cta: 'Open the scribe'
  },
  {
    kicker: 'Timer',
    title: 'Run the wave breaker',
    description:
      'A small console for the hand-to-mouth autopilot loop: interrupt, move, name the stripe, come back.',
    href: '/timer',
    cta: 'Start the timer'
  },
  {
    kicker: 'Cabinet',
    title: 'Open the toolkit',
    description:
      'Official resources, grounding moves, reset rituals, and outside support when the wall needs backup.',
    href: '/toolkit',
    cta: 'Open the cabinet'
  }
];

export const retroApps = toolCabinet.map((item) => ({
  eyebrow: item.kicker,
  title: item.title,
  description: item.description,
  href: item.href,
  cta: item.cta,
  external: item.href.startsWith('http')
}));

export const searchSignals: SearchSignal[] = [
  {
    kicker: 'Signal boost',
    title: 'Bad headlines, shaky hands',
    description:
      'Use search.rasies.com when the news is making your nervous system loud and you want language before you want nicotine.',
    query: 'latest headlines anxiety nicotine today'
  },
  {
    kicker: 'Signal boost',
    title: 'Money stress and the urge',
    description:
      'For rent panic, layoffs, bills, inflation, and the craving that arrives wearing a practical little hat.',
    query: 'cost of living stress quitting nicotine'
  },
  {
    kicker: 'Signal boost',
    title: 'Quit science without the lecture',
    description:
      'Find practical nicotine, craving, and withdrawal language, then bring the part that actually helps back to the wall.',
    query: 'vaping nicotine withdrawal cravings quit support'
  },
  {
    kicker: 'Signal boost',
    title: 'Your city, your weather, your mood',
    description:
      'Swap in your city name when your trigger has a route, a corner store, a commute, or a specific kind of rain attached.',
    query: 'your city nightlife stress quitting nicotine'
  }
];

export const worldPrompts = searchSignals.map(
  (item) => `${item.title}. ${item.description.replace(/`/g, '')}`
);

export const toolkitQuickSteps = [
  'Move the vape, card, app, or buying path farther away than the craving expects.',
  'Name the stripe: mouth habit, panic, boredom, anger, sadness, party reflex, or phone spiral.',
  'Give your hands a replacement job: ice water, gum, mint, towel, pen, dishes, keys, walk.',
  'Change one physical thing: room, light, shoes, window, route, playlist, posture.',
  'Post before you decide. The wall exists so the craving is not the only witness.'
];

export const toolkitPlan = [
  'Map the hour that usually gets you. Build one replacement ritual for exactly that hour.',
  'Make nicotine annoying to reach: delete the easy order flow, move the card, change the route, empty the drawer.',
  'Keep one sensory fallback close enough to win the first minute: mint, straw, tea, cold water, playlist, sketchbook.',
  'Tell one person the exact sentence that helps: say no, distract me, remind me I hate starting over.',
  'Save receipts for future-you: wall note, screenshot, tally mark, calendar dot, anything visible.'
];

export const toolkitReset = [
  'Do not build a cathedral around one slip. Write the boring true version while it is still small.',
  'Mark the trigger: place, person, feeling, headline, hour, hunger, drink, route, or silence.',
  'Pick one environmental change before the day ends. Smaller radius beats louder shame.',
  'Ask for backup sooner than feels stylish. Private lighting makes shame look bigger.'
];

export const timerStages = [
  {
    seconds: 60,
    label: 'Minute 1',
    description: 'Move the buying path. Unclench your jaw. Put both feet on the floor.'
  },
  {
    seconds: 180,
    label: 'Minute 3',
    description: 'Name the stripe and give your hands a task. You are not negotiating yet.'
  },
  {
    seconds: 420,
    label: 'Minute 7',
    description: 'Change rooms, text someone, or turn the hour into a wall note with receipts.'
  }
];

export const timerRitual = timerStages.map((stage) => `${stage.label}. ${stage.description}`);

export const submitPrompts = [
  'The stripe I am fighting right now is ____.',
  'The craving promised me ____, but the real scene is ____.',
  'I almost vaped when ____. I did ____ instead.',
  'Slip receipt: what happened, what lit it, what changes before tonight ends.',
  'Tiny win, ugly lighting: ____.'
];

export const submitNotes = [
  'Anonymous is not less real.',
  'One paragraph beats one secret spiral.',
  'Dark is welcome. Cruel is not.',
  'If it is an emergency, use live crisis support, not the wall.'
];

export const chatModes: ChatMode[] = [
  {
    id: 'craving',
    label: 'Craving',
    description: 'Triage the next ten minutes.',
    prompt: 'I want a hit right now. Help me beat the first stripe.'
  },
  {
    id: 'post',
    label: 'Post',
    description: 'Turn the hour into a wall note.',
    prompt: 'Help me turn this ugly hour into a wall post.'
  },
  {
    id: 'reset',
    label: 'Slip',
    description: 'Reset without shame theater.',
    prompt: 'I slipped and I need a reset that does not make me disappear.'
  },
  {
    id: 'world',
    label: 'World',
    description: 'Ground the doomscroll static.',
    prompt: 'The world/news/internet has my nervous system loud and I want nicotine.'
  }
];

export const chatStarterPrompts = chatModes.map((mode) => mode.prompt);

export const editorialPromptBank: EditorialPrompt[] = [
  {
    label: 'Craving wall prompt',
    seed: 'Wall prompt: name the stripe nicotine is wearing tonight, then name the object in the room that proves you are still here.'
  },
  {
    label: 'Slip receipt',
    seed: 'Slip receipt format: what happened, what lit it, what changes before the night ends. No funeral music.'
  },
  {
    label: 'Tiny win',
    seed: 'Tiny win, ugly lighting: ____. Future-me gets this receipt.'
  },
  {
    label: 'Doomscroll note',
    seed: 'The headline under my skin tonight is ____. It made me want ____. What I am doing instead is ____.'
  }
];

export const seussNods = [
  'Thirty striped urges can arrive in a line. You only owe the first one an answer.',
  'Bent little rhymes are allowed. The next move still has to be real.',
  'If the beast is too big, take one stripe and leave the legend for tomorrow.'
];

export const wallRituals = [
  'Read three notes before you bargain with the urge.',
  'Post one sentence before you open a buying path.',
  'Use the Scribe when the feeling needs a shape, not a lecture.',
  'Use official backup when the wall is not enough.'
];

export const supportResources = [
  {
    title: 'SmokefreeTXT',
    description: 'Free text-message support from Smokefree.gov for quitting tobacco or vaping.',
    href: 'https://smokefree.gov/tools-tips/text-programs',
    meta: 'Text support'
  },
  {
    title: '1-800-QUIT-NOW',
    description:
      'Free and confidential quit coaching from trained quitline coaches in the United States.',
    href: 'https://www.cdc.gov/quit-smoking/quitlines/index.html',
    meta: 'Quitline'
  },
  {
    title: 'This is Quitting',
    description: 'Free anonymous text support for teens and young adults quitting vaping.',
    href: 'https://truthinitiative.org/this-is-quitting',
    meta: 'Truth Initiative'
  },
  {
    title: '988 Lifeline',
    description: 'Call or text 988 any time if the feelings are turning into an emergency.',
    href: 'https://988lifeline.org/',
    meta: 'Crisis support'
  }
];

export const aboutFallbackMd = `
Licking Vape is an anonymous wall for people quitting nicotine without pretending the story is tidy.

### What this room is
- A modern dark sideblog for cravings, slips, mouth-habit grief, weird rituals, world noise, and tiny wins.
- A place to post the hour before the hour becomes a purchase.
- A wall with a timer, official support links, and a mode-based Stripe Scribe for concrete help.

### What the tone is
- Less public-health podium.
- More crooked late-night storybook with receipts.
- Funny when it can be, blunt when it has to be, never cruel.

### How moderation works
- Automated policy checks catch PII, hate, explicit sexual content, medical-claim weirdness, and crisis language.
- The Stripe Scribe sidecar can review and draft with the local LLM stack when configured.
- Human desk review stays available for the notes that need eyes.

### What the line is
- The wall is peer support, not professional care.
- Vivid is good. Doxxing, cruelty, spam, and crisis dumping are not.
- If you feel unsafe, contact emergency services or 988.

The name points at impossible striped bravado: too many beasts, too much mouth, one real refusal at a time.
`.trim();

export const shoutoutFallback =
  'Built as an anonymous dark sideblog for quitting nicotine: thirty striped urges, one posted refusal.';
