"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "./ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";

const labels = {
  "pt-BR": {
    day: "Dia",
    lessons: ["aula", "aulas"],
    search: "Buscar dia ou aula...",
    empty: "Nenhum resultado.",
    days: "Dias",
    lessonsGroup: "Aulas",
  },
  "en-US": {
    day: "Day",
    lessons: ["lesson", "lessons"],
    search: "Search day or lesson...",
    empty: "No results.",
    days: "Days",
    lessonsGroup: "Lessons",
  },
};

export function ClassesGrid({ lang, days }) {
  const t = labels[lang] ?? labels["pt-BR"];
  const router = useRouter();
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const count = (n) => `${n} ${t.lessons[n === 1 ? 0 : 1]}`;

  const lessons = days.flatMap((day) =>
    day.lessons.map((lesson) => ({ ...lesson, day })),
  );

  return (
    <div className="not-prose my-6 flex flex-col gap-6">
      <Command>
        <CommandInput
          placeholder={t.search}
          value={query}
          onValueChange={setQuery}
        />
        {searching && (
          <CommandList>
            <CommandEmpty>{t.empty}</CommandEmpty>
            <CommandGroup heading={t.days}>
              {days.map((day) => (
                <CommandItem
                  key={day.route}
                  value={`${t.day} ${day.number} ${day.title}`}
                  onSelect={() => router.push(day.route)}
                >
                  <span className="font-medium">
                    {t.day} {day.number}
                  </span>
                  <span className="truncate text-neutral-500">{day.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={t.lessonsGroup}>
              {lessons.map((lesson) => (
                <CommandItem
                  key={lesson.route}
                  value={`${lesson.order} ${lesson.title} ${t.day} ${lesson.day.number}`}
                  onSelect={() => router.push(lesson.route)}
                >
                  <span className="font-medium">{lesson.order}</span>
                  <span className="truncate">{lesson.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        )}
      </Command>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {days.map((day) => (
          <Card key={day.route} className="h-full relative shadow-none">
            <CardHeader>
              <CardDescription className="font-medium">
                {t.day} {day.number}
              </CardDescription>
              <Badge>{count(day.lessonCount)}</Badge>
            </CardHeader>
            <CardTitle className="flex flex-col gap-2">
              {day.lessons.map((lesson) => (
                <Link
                  key={lesson.route}
                  href={lesson.route}
                  className="flex gap-2 font-medium text-xs no-underline hover:text-green-500"
                >
                  <span className="shrink-0 text-neutral-500">
                    {lesson.order}
                  </span>
                  <span>{lesson.title}</span>
                </Link>
              ))}
            </CardTitle>
          </Card>
        ))}
      </div>
    </div>
  );
}
