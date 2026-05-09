"use client";

import { useEffect, useState } from "react";
import { LevelCard } from "@/components/LevelCard";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { Route } from "@jogmania/shared";

export default function RoutesPage() {
  const { user } = useAuth();
  const api = useApi();
  const [routes, setRoutes] = useState<Route[]>([]);

  useEffect(() => {
    if (!user) return;
    api.listRoutes().then(setRoutes).catch(() => setRoutes([]));
  }, [api, user]);

  const courses = routes.filter((route) => route.is_course);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="jm-kicker">Adventure Courses</p>
          <h3 className="font-display text-xl mt-2">Repeatable runs with arcade scoring.</h3>
          <p className="text-xs text-jm-muted">Activate a run to turn it into a course adventure.</p>
        </div>
        <Badge tone="slate">{courses.length} total</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {courses.map((route) => (
          <LevelCard key={route.id} route={route} />
        ))}
        {courses.length === 0 && <p className="text-sm text-jm-muted">No courses yet.</p>}
      </div>
    </div>
  );
}
