import type { ElementType, ReactNode } from "react";
import { Globe } from "lucide-react";

import { cn } from "@/shared/utils";
import { Badge } from "@/shared/ui/primitives";

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.74a1.63 1.63 0 1 0 0 3.26 1.63 1.63 0 0 0 0-3.26Z" />
  </svg>
);

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" />
  </svg>
);

const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DribbbleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm6.65 6.1a8.34 8.34 0 0 1 1.83 5.09 7.84 7.84 0 0 1-.36 2.37 13.9 13.9 0 0 0-4.63-2.18 18.22 18.22 0 0 0 .5-2.22 13.82 13.82 0 0 0 2.66-3.06zM12 3.65a8.3 8.3 0 0 1 4.79 1.5 12.16 12.16 0 0 1-2.48 2.82 14.15 14.15 0 0 0-3.32-3.88A8.44 8.44 0 0 1 12 3.65zm-3.09 1.1a15.7 15.7 0 0 1 3.42 4 14.28 14.28 0 0 1-5.78 1.18 12.63 12.63 0 0 1-1.3-.06A8.32 8.32 0 0 1 8.91 4.75zM3.65 12a8.2 8.2 0 0 1 .3-2.18A14.2 14.2 0 0 0 5.8 10a15.86 15.86 0 0 0 6.44-1.3 16.5 16.5 0 0 1-.48 2.35 15.42 15.42 0 0 1-8.11 1zM12 20.35a8.33 8.33 0 0 1-5.26-1.87 13.78 13.78 0 0 0 7.85-1.12A18.8 18.8 0 0 1 12 20.35zm3.84-4a15.46 15.46 0 0 1-7.07 1 14 14 0 0 1 7.07-1z" />
  </svg>
);

export type Team5SocialPlatform =
  | "linkedin"
  | "github"
  | "twitter"
  | "dribbble"
  | "website";

export interface Team5Social {
  platform: Team5SocialPlatform;
  url: string;
  label?: string;
}

export interface Team5Member {
  id: string;
  name: string;
  role?: string;
  image: string;
  socials?: Team5Social[];
}

export interface Team5Props {
  badge?: string;
  heading?: string;
  description?: string;
  members?: Team5Member[];
  className?: string;
  renderLink?: (props: {
    href: string;
    label: string;
    children: ReactNode;
  }) => ReactNode;
}

const socialIconMap: Record<Team5SocialPlatform, ElementType> = {
  linkedin: LinkedinIcon,
  github: GithubIcon,
  twitter: TwitterIcon,
  dribbble: DribbbleIcon,
  website: Globe,
};

/** Team members for Career Copilot. */
const defaultMembers: Team5Member[] = [
  {
    id: "daji-adelkar",
    name: "Daji Adelkar",
    image: "/team/daji-adelkar.jpg",
    socials: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/daji-adelkar-b16858269/",
        label: "Daji Adelkar on LinkedIn",
      },
    ],
  },
  {
    id: "ronak-k",
    name: "Ronak K.",
    image: "/team/ronak-k.jpg",
    socials: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/ronak-k-2b1974214/",
        label: "Ronak K. on LinkedIn",
      },
    ],
  },
  {
    id: "pratik-bamhane",
    name: "Pratik Bamhane",
    image: "/team/pratik-bamhane.jpg",
    socials: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/pratik-bamhane/",
        label: "Pratik Bamhane on LinkedIn",
      },
    ],
  },
  {
    id: "mohammad-faizan-khan",
    name: "Mohammad Faizan Khan",
    image: "/team/mohammad-faizan-khan.jpg",
    socials: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/13faizankhan/",
        label: "Mohammad Faizan Khan on LinkedIn",
      },
    ],
  },
  {
    id: "priyansu-pattanaik",
    name: "Priyansu Pattanaik",
    image: "/team/priyansu-pattanaik.jpg",
    socials: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/priyansupattanaik/",
        label: "Priyansu Pattanaik on LinkedIn",
      },
    ],
  },
];

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function MemberSocialLinks({
  member,
  renderLink,
}: {
  member: Team5Member;
  renderLink?: Team5Props["renderLink"];
}) {
  const socials = (member.socials || []).filter((social) =>
    isHttpUrl(social.url),
  );
  if (!socials.length) return null;

  return (
    <div className="team5-socials flex items-center gap-2">
      {socials.map((social) => {
        const Icon = socialIconMap[social.platform];
        if (!Icon) return null;

        const label = social.label ?? `${member.name} on ${social.platform}`;

        const content = (
          <span className="team5-social flex size-8 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-zinc-950">
            <Icon className="size-3.5" aria-hidden />
          </span>
        );

        if (renderLink) {
          return (
            <span key={`${social.platform}-${social.url}`}>
              {renderLink({ href: social.url, label, children: content })}
            </span>
          );
        }

        return (
          <a
            key={`${social.platform}-${social.url}`}
            href={social.url}
            aria-label={label}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

function MemberStrip({
  member,
  renderLink,
}: {
  member: Team5Member;
  renderLink?: Team5Props["renderLink"];
}) {
  return (
    <article
      className={cn(
        "team5-member group relative min-w-0 flex-[1] overflow-hidden rounded-lg",
        "cursor-pointer shadow-sm transition-all duration-500",
        "hover:flex-[3] hover:shadow-xl focus-within:flex-[3] focus-within:shadow-xl",
      )}
      tabIndex={0}
    >
      <img
        src={member.image}
        alt={`Portrait of ${member.name}`}
        className="team5-photo absolute inset-0 h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0 group-focus-within:grayscale-0"
        loading="lazy"
      />

      <div className="team5-shade absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />

      <div className="team5-meta absolute inset-x-0 bottom-0 flex translate-y-3 flex-col gap-3 p-5 opacity-0 transition-all delay-100 duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 sm:p-6">
        {member.role ? (
          <Badge variant="secondary" className="w-fit text-xs">
            {member.role}
          </Badge>
        ) : null}

        <h3 className="text-xl font-semibold tracking-tight whitespace-nowrap text-white sm:text-2xl">
          {member.name}
        </h3>

        <MemberSocialLinks member={member} renderLink={renderLink} />
      </div>
    </article>
  );
}

export default function Team5({
  badge,
  heading = "The team",
  description = "Five minds. One mission. We ship products that matter.",
  members = defaultMembers,
  className,
  renderLink,
}: Team5Props) {
  return (
    <section
      className={cn("team5 bg-background w-full py-16 sm:py-24", className)}
    >
      <div className="team5-inner mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="team5-copy mb-10 flex flex-col items-center text-center sm:mb-14">
          {badge ? <p className="home-kicker">{badge}</p> : null}
          {heading ? (
            <h2
              id="team-title"
              className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl"
            >
              {heading}
            </h2>
          ) : null}

          {description ? (
            <p className="text-muted-foreground mt-4 max-w-xl text-base sm:text-lg">
              {description}
            </p>
          ) : null}
        </div>

        <div className="team5-row flex h-72 gap-1.5 sm:h-80 sm:gap-2 md:h-96">
          {members.map((member) => (
            <MemberStrip
              key={member.id}
              member={member}
              renderLink={renderLink}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export { Team5, defaultMembers };
