import { nanoid } from "nanoid";

const adjectives = [
  "Anonymous",
  "Wandering",
  "Mythic",
  "Hidden",
  "Righteous",
  "Stellar",
  "Brave",
  "Quiet",
  "Ethereal",
  "Galactic",
  "Clever",
  "Gleaming"
];

const animals = ["Badger", "Otter", "Raven", "Fox", "Lynx", "Heron", "Wolf", "Hare", "Moth", "Dragonfly", "Coyote"];

export function makePseudonym() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj} ${animal} #${num}`;
}

export function makeAvatarSeed() {
  return nanoid(10);
}
