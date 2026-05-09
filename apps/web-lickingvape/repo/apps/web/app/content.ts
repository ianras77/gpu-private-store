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

export const buildRasiesSearchHref = (query: string) =>
  `https://search.rasies.com/search?q=${encodeURIComponent(query)}&language=en-US&safesearch=0`;

export const starterPosts: Post[] = [
  {
    id: -1,
    author_type: 'admin',
    display_name: 'inkblot',
    body: 'Breakfast headline spiral almost turned into a nicotine excuse. Posted here instead. Black coffee, cold sink water, open window. The craving went from feral to merely rude.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 5),
    published_at: isoMinutesAgo(60 * 24 * 5),
    tags: ['doomscroll', 'morning', 'held-on']
  },
  {
    id: -2,
    author_type: 'admin',
    display_name: 'lamplight',
    body: 'Roommate drama plus work email avalanche. I wanted the old hand ritual more than the nicotine itself. Walked the block, came back, wrote this instead.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 4 + 80),
    published_at: isoMinutesAgo(60 * 24 * 4 + 80),
    tags: ['ritual', 'stress', 'check-in']
  },
  {
    id: -3,
    author_type: 'admin',
    display_name: 'smokeghost',
    body: 'Tonight I miss the pause button, not the vape. Tea in a chipped mug. Fan on. Phone face-down. My lungs feel less haunted than they did last month.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 4 + 240),
    published_at: isoMinutesAgo(60 * 24 * 4 + 240),
    tags: ['night', 'ritual-swap', 'body']
  },
  {
    id: -4,
    author_type: 'admin',
    display_name: 'J',
    body: 'Slip report: bought one yesterday, told on myself today, threw it out tonight. No myth-making, no collapse. Just receipts and a smaller radius tomorrow.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 3 + 30),
    published_at: isoMinutesAgo(60 * 24 * 3 + 30),
    tags: ['slip', 'receipts', 'reset']
  },
  {
    id: -5,
    author_type: 'admin',
    display_name: 'ravenwire',
    body: 'Rent is due, the news is weird, and every ad seems to know I am tired. Still did not buy pods. That is the whole poem tonight.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 2 + 210),
    published_at: isoMinutesAgo(60 * 24 * 2 + 210),
    tags: ['money', 'world-notes', 'small-win']
  },
  {
    id: -6,
    author_type: 'admin',
    display_name: 'thinmoon',
    body: 'Driving used to be automatic vape territory. Tonight it was gum, cracked windows, and one dramatic song on repeat. Weirdly survivable.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 * 2 + 480),
    published_at: isoMinutesAgo(60 * 24 * 2 + 480),
    tags: ['driving', 'trigger-map', 'survived']
  },
  {
    id: -7,
    author_type: 'admin',
    display_name: 'T',
    body: 'Left the apartment without the device and did not do the little panic-turnaround. Felt gothic and brave and mildly ridiculous. I will take it.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 24 + 90),
    published_at: isoMinutesAgo(60 * 24 + 90),
    tags: ['win', 'confidence', 'daylight']
  },
  {
    id: -8,
    author_type: 'admin',
    display_name: null,
    body: 'Morning one without nicotine before coffee. Turns out my brain is loud but not prophetic.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 18),
    published_at: isoMinutesAgo(60 * 18),
    tags: ['day-one', 'morning', 'rewiring']
  },
  {
    id: -9,
    author_type: 'admin',
    display_name: 'L',
    body: 'Grounding trick, revised for bad-news days: name the headline, name the feeling, name one thing in the room that is actually real. It helped.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 12),
    published_at: isoMinutesAgo(60 * 12),
    tags: ['grounding', 'news', 'nervous-system']
  },
  {
    id: -10,
    author_type: 'admin',
    display_name: 'A',
    body: 'After dinner remains my villain origin story. Tonight I folded laundry and wrote a mean little list of reasons I do not want to start over.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 8),
    published_at: isoMinutesAgo(60 * 8),
    tags: ['after-dinner', 'hands-busy', 'resolve']
  },
  {
    id: -11,
    author_type: 'admin',
    display_name: 'C',
    body: 'Texted my friend: if I ask for a hit tonight, say no and remind me I am being dramatic. Outsourcing the spine a little.',
    status: 'published',
    created_at: isoMinutesAgo(60 * 5),
    published_at: isoMinutesAgo(60 * 5),
    tags: ['boundary', 'support', 'humor']
  },
  {
    id: -12,
    author_type: 'admin',
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
    title: 'Quit diary, not wellness theater.',
    description:
      'The feed wants the actual scene: craving, slip, weird thought, relapse math, tiny win, and whatever else the night did to you.'
  },
  {
    title: 'Life notes and world notes count.',
    description:
      'Money stress, headlines, work rot, friend drama, boredom, grief. If it tangles with nicotine, it belongs in the room.'
  },
  {
    title: 'Cheshire holds the thread.',
    description:
      'The cat remembers your goal, mood, streak, and current mess so every conversation can start a little deeper.'
  }
];

export const moodStickers = [
  'doomscroll support club',
  'crooked storybook energy',
  'late-night archive keeper',
  'nicotine funeral attire'
];

export const tickerLines = [
  'post before the craving writes fanfic',
  'life notes and world notes still count',
  'curated, not sanitized',
  'one stripe at a time',
  'the room is open and the feed is watching',
  'dark little sideblog, soft little survival plan'
];

export const editorialLanes = [
  {
    title: 'Quit notes',
    description: 'Cravings, slips, rituals, mouth-habit grief, and the tiny mechanics of getting through the next hour.'
  },
  {
    title: 'Life notes',
    description: 'Sleep, money, work, family, roommates, heartbreak, boredom, and the parts of quitting that happen off the brochure.'
  },
  {
    title: 'World notes',
    description:
      'The headline that got under your skin, the policy story that made you furious, the general feeling that the century is doing too much.'
  }
];

export const howItWorks = [
  {
    title: 'Drop the scene fast',
    description: 'One clean paragraph is enough. What happened, what it made you want, what you did next.'
  },
  {
    title: 'Curated, not flattened',
    description: 'Submissions are reviewed so the room can stay sharp, supportive, and free of spam or cruelty.'
  },
  {
    title: 'Use the side cabinets',
    description: 'Timer, toolkit, Cheshire, and current-world prompts are there when the feed alone is not enough.'
  }
];

export const toolCabinet: ToolCard[] = [
  {
    kicker: 'Little app',
    title: 'Post to the den',
    description: 'Fast lane for cravings, slips, weird victories, and the sentence you need to say before you backslide.',
    href: '/submit',
    cta: 'Open the post box'
  },
  {
    kicker: 'Little app',
    title: 'Talk to Cheshire',
    description:
      'Late-night creator energy with memory. Bring your nicotine logic, life mess, or the headline that won’t leave your body alone.',
    href: '/#cheshire',
    cta: 'Open the cat thread'
  },
  {
    kicker: 'Little app',
    title: 'Run the wave timer',
    description: 'A retro little interruption machine for the hand-to-mouth autopilot loop.',
    href: '/timer',
    cta: 'Start the timer'
  },
  {
    kicker: 'Little app',
    title: 'Open the toolkit',
    description: 'Grounding moves, reset rituals, and outside support when the room in your head gets too echoey.',
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
      'Use `search.rasies.com` when the news is making your nervous system weird and you want language before you want nicotine.',
    query: 'latest headlines anxiety nicotine today'
  },
  {
    kicker: 'Signal boost',
    title: 'Money stress and the urge',
    description:
      'Good for rent panic, work dread, layoffs, inflation, and the very specific craving that arrives with financial doom.',
    query: 'cost of living stress quitting nicotine'
  },
  {
    kicker: 'Signal boost',
    title: 'What policy people are doing',
    description:
      'For anyone who wants to talk about vaping rules, public health news, or the part where systems affect cravings too.',
    query: 'vape policy nicotine regulation today'
  },
  {
    kicker: 'Signal boost',
    title: 'Your city, your weather, your mood',
    description:
      'Swap in your city name and look at the local swirl when your personal trigger has a zip code attached to it.',
    query: 'your city nightlife stress quitting nicotine'
  }
];

export const worldPrompts = searchSignals.map(
  (item) => `${item.title}. ${item.description.replace(/`/g, '')}`
);

export const toolkitQuickSteps = [
  'Name the scene in one sentence: what happened, where you are, and what you want to do.',
  'Put the device or buying method farther away than arm’s reach for the next three minutes.',
  'Drink something cold, loosen your jaw, and give your hands a job.',
  'Leave the doomscroll tab. Stand up. Change rooms. Change light.',
  'Post before you decide. The feed exists so the craving is not the only witness.'
];

export const toolkitPlan = [
  'Write the hour of day that most often takes you out, then build a replacement ritual for exactly that hour.',
  'Keep one sensory fallback nearby: mint, gum, ice water, tea, cinnamon, playlist, sketchbook, whatever interrupts the loop.',
  'Tell one person what support looks like in a sentence blunt enough to survive a hard night.',
  'Make nicotine a hassle. Move devices, delete the easy order flow, change the route, change the drawer.',
  'Decide what future-you gets to read after a win: a note, a screenshot, a post, a receipt.'
];

export const toolkitReset = [
  'Do not build a myth around one slip. Write what happened while it is still boring and specific.',
  'Mark the trigger: place, person, feeling, headline, or hour.',
  'Choose one physical change for next time. Smaller radius, different route, phone in another room, cash not card.',
  'Reset in public if you can. Shame loves private lighting.'
];

export const timerStages = [
  {
    seconds: 60,
    label: 'Minute 1',
    description: 'Interrupt the ritual. Water, breath, open hands, feet on the floor.'
  },
  {
    seconds: 180,
    label: 'Minute 3',
    description: 'The spike usually breaks here. Stay annoying about surviving it.'
  },
  {
    seconds: 420,
    label: 'Minute 7',
    description: 'Enough time to move rooms, text someone, or turn this into a post with receipts.'
  }
];

export const timerRitual = timerStages.map((stage) => `${stage.label}. ${stage.description}`);

export const submitPrompts = [
  'What happened in your body right before the craving showed up?',
  'What did the headline, text, commute, or conversation make you want?',
  'What tiny move kept tonight from getting worse?',
  'If you slipped, what is the boring true version of what happened?',
  'What do you want the feed to know about this exact hour?'
];

export const submitNotes = [
  'Raw is allowed. Performative is optional.',
  'You can be anonymous and still be vivid.',
  'If the world is part of the story, say that part too.'
];

export const chatStarterPrompts = [
  'The news has me wanting nicotine again.',
  'Help me turn tonight into a post.',
  'I slipped and I do not want to disappear.',
  'Make me a tiny plan for the next hour.'
];

export const editorialPromptBank: EditorialPrompt[] = [
  {
    label: 'News grief note',
    seed: 'The headline under my skin tonight is ____. It made me want ____. What I am doing instead is ____.'
  },
  {
    label: 'Craving scene',
    seed: 'Scene report: where I am, what just happened, how loud the urge got, and what I reached for instead.'
  },
  {
    label: 'Tiny win',
    seed: 'Small ugly win with bad lighting: ____.'
  },
  {
    label: 'Ask the room',
    seed: 'Tell me your strangest trigger this week and the thing that kept you from letting it run the night.'
  }
];

export const seussNods = [
  'If the whole striped beast feels impossible, take one stripe and leave the legend for tomorrow.',
  'Crooked courage still counts. Especially the kind that shows up in ugly lighting.',
  'The mood can stay gothic. The next move still has to be real.'
];

export const supportResources = [
  {
    title: 'SmokefreeTXT',
    description: 'Free text support from Smokefree.gov if you want official backup in your pocket.',
    href: 'https://smokefree.gov/tools-tips/text-programs',
    meta: 'US text support'
  },
  {
    title: '1-800-QUIT-NOW',
    description: 'Free quit coaching and nicotine-cessation resources from live humans.',
    href: 'https://www.cdc.gov/quit-smoking/quitlines/index.html',
    meta: 'Quitline'
  },
  {
    title: 'This is Quitting',
    description: 'Text DITCHVAPE to 88709 for youth and young-adult support.',
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
Licking Vape is a dimly lit feed for people quitting nicotine without pretending life is tidy.

### What this room is
- A feed-first diary for cravings, slips, rituals, money stress, weird headlines, and tiny wins.
- A place where moody posts are welcome as long as they stay human.
- A corner with a memory-keeping Cheshire Cat, a timer, and a cabinet full of backup moves.

### What the tone is
- Less health-class flyer.
- More late-night internet post with receipts.
- Honest, curated, and built for people still in the middle of it.

### What the line is
- We can be dark without being cruel.
- We can talk about the world without doomscrolling each other into the floor.
- We are not a replacement for professional care.

The name winks at old impossible-animal bravado: striped chaos, bent logic, one hard thing at a time.
`.trim();

export const shoutoutFallback =
  'Built on crooked-tiger bravado, nicotine-exit honesty, and late-night internet diary energy.';
