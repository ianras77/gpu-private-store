import { arcadeServices } from "../lib/arcade";
import { Card, CardDescription, CardTitle } from "./ui/card";

export function ServerArcade() {
  return (
    <section id="arcade" className="w-full px-6 py-16">
      <div className="mb-8 flex flex-col gap-3">
        <h2 className="section-title text-3xl">
          The <span className="magical-text">Server Arcade</span>
        </h2>
        <p className="text-cloud/80">Every cabinet is a real service humming in the rack.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {arcadeServices.map((service) => (
          <Card key={service.name} className="group flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="rave-chip flex h-12 w-12 items-center justify-center rounded-2xl text-glow">
                <service.icon size={22} />
              </div>
              <CardTitle>{service.name}</CardTitle>
            </div>
            <CardDescription>{service.description}</CardDescription>
            <a
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-glow"
              href={service.href}
            >
              Launch cabinet <span className="transition group-hover:translate-x-1">→</span>
            </a>
          </Card>
        ))}
      </div>
    </section>
  );
}
