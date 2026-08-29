export type RassysAppDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  description: string;
  homepageDescription: string;
  iconName: string;
  accent: string;
  priority: number;
  public: boolean;
  statusKey?: string;
  aliases?: string[];
};

export const rassysApps = [
  { id: "mr-rassy", label: "Mr Rassy", shortLabel: "Radio", href: "/mr-rassy", description: "A living station, library, and trackbook.", homepageDescription: "Tune in, browse the library, and ask what is playing.", iconName: "radio", accent: "yellow", priority: 1, public: true, statusKey: "radio", aliases: ["/radio", "/listening-room"] },
  { id: "dungeon-master", label: "Dungeon Master", shortLabel: "DM", href: "/dungeon-master", description: "A chat-first campaign table.", homepageDescription: "Continue a campaign or make a new world.", iconName: "swords", accent: "pink", priority: 2, public: true, statusKey: "dungeonMaster", aliases: ["/dm"] },
  { id: "minecraft", label: "Minecraft", shortLabel: "MC", href: "/minecraft", description: "The shared world and its stories.", homepageDescription: "See the world, players, builds, and events.", iconName: "cube", accent: "cyan", priority: 3, public: true, statusKey: "minecraft", aliases: ["/mc"] },
  { id: "stories", label: "Stories", shortLabel: "Stories", href: "/stories", description: "Bedtime stories and things to hear.", homepageDescription: "Keep listening to the family story shelf.", iconName: "book", accent: "violet", priority: 4, public: true, aliases: ["/real-life-bedtime-stories"] },
  { id: "family", label: "Family Archive", shortLabel: "Family", href: "/family", description: "Photos, videos, and memories.", homepageDescription: "A private archive of the people and moments that matter.", iconName: "images", accent: "green", priority: 5, public: true, aliases: ["/photos"] },
  { id: "notebook", label: "Notebook", shortLabel: "Notes", href: "/notebook", description: "Thoughts, interests, and notes.", homepageDescription: "A running notebook from around here.", iconName: "notebook", accent: "blue", priority: 6, public: true, aliases: ["/thoughts"] },
] satisfies RassysAppDefinition[];

export const publicRassysApps = rassysApps.filter((app) => app.public).sort((a, b) => a.priority - b.priority);
