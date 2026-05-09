import { MrRassyLiveDJ } from "./rassy";
import { DJPlugin } from "./interface";

export const djPlugins: DJPlugin[] = [new MrRassyLiveDJ()];

export const defaultDJ = djPlugins[0];
