import {
  motion,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import type { LucideProps } from "lucide-react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Banknote,
  Bell,
  Bookmark,
  BookOpen,
  BookOpenCheck,
  Briefcase,
  BriefcaseBusiness,
  Building,
  Building2,
  Check,
  CheckCheck,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CloudUpload,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  History,
  Inbox,
  Loader,
  Loader2,
  LoaderCircle,
  LogOut,
  MailCheck,
  MapPin,
  Menu,
  Moon,
  MoveLeft,
  MoveRight,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Trash2,
  User,
  UserRound,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";

export type LucideIcon = ForwardRefExoticComponent<
  LucideProps & RefAttributes<SVGSVGElement>
>;

export type AnimateIconAnimation =
  | "default"
  | "pointing"
  | "pointing-left"
  | "pointing-down"
  | "pointing-up"
  | "draw"
  | "search"
  | "sparkle"
  | "trash-lid"
  | "bookmark"
  | "fly"
  | "blink"
  | "rotate"
  | "spin"
  | "external"
  | "drop"
  | "lift"
  | "people"
  | "play"
  | "video"
  | "flutter"
  | "thumb-up"
  | "thumb-down"
  | "shake"
  | "pulse"
  | "bounce";

export type AnimateIconProps = {
  children?: ReactNode;
  icon?: LucideIcon;
  animation?: AnimateIconAnimation;
  animateOnHover?: boolean;
  animateOnTap?: boolean;
  animateOnView?: boolean;
  loop?: boolean;
  loopDelay?: number;
  delay?: number;
  idle?: boolean; // deprecated compatibility flag
  className?: string;
  style?: CSSProperties;
  size?: number | string;
} & Omit<LucideProps, "icon">;

const springQuick: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 20,
  mass: 0.6,
};

const microVariants: Record<
  AnimateIconAnimation,
  {
    rest: TargetAndTransition;
    animate: TargetAndTransition;
    transition?: Transition;
  }
> = {
  default: {
    rest: { scale: 1, y: 0, rotate: 0 },
    animate: { scale: 1.15, y: -2 },
    transition: springQuick,
  },
  pointing: {
    rest: { x: 0, scale: 1 },
    animate: { x: [0, 5, 0], scale: [1, 1.08, 1] },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
  "pointing-left": {
    rest: { x: 0, scale: 1 },
    animate: { x: [0, -5, 0], scale: [1, 1.08, 1] },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
  "pointing-down": {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, 5, 0], scale: [1, 1.08, 1] },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
  "pointing-up": {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, -5, 0], scale: [1, 1.08, 1] },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
  draw: {
    rest: { scale: 1, rotate: 0 },
    animate: { scale: [1, 1.25, 0.95, 1], rotate: [0, -8, 6, 0] },
    transition: { duration: 0.45, ease: "easeInOut" },
  },
  search: {
    rest: { scale: 1, rotate: 0 },
    animate: { scale: [1, 1.2, 1], rotate: [0, -15, 12, 0] },
    transition: { duration: 0.5, ease: "easeOut" },
  },
  sparkle: {
    rest: { scale: 1, rotate: 0 },
    animate: { scale: [1, 1.3, 0.92, 1], rotate: [0, 22, -18, 0] },
    transition: { duration: 0.52, ease: "easeInOut" },
  },
  "trash-lid": {
    rest: { y: 0, rotate: 0, scale: 1 },
    animate: { y: [0, -4, 0], rotate: [0, -14, 4, 0], scale: [1, 1.06, 1] },
    transition: { duration: 0.42, ease: "easeOut" },
  },
  bookmark: {
    rest: { y: 0, scaleY: 1 },
    animate: { y: [0, 4, -1, 0], scaleY: [1, 1.2, 0.95, 1] },
    transition: { duration: 0.45, ease: "easeInOut" },
  },
  fly: {
    rest: { x: 0, y: 0, rotate: 0, scale: 1 },
    animate: {
      x: [0, 5, 0],
      y: [0, -5, 0],
      rotate: [0, -12, 0],
      scale: [1, 1.1, 1],
    },
    transition: { duration: 0.48, ease: "easeOut" },
  },
  blink: {
    rest: { scaleY: 1 },
    animate: { scaleY: [1, 0.15, 1] },
    transition: { duration: 0.28, ease: "easeInOut" },
  },
  rotate: {
    rest: { rotate: 0 },
    animate: { rotate: 360 },
    transition: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
  },
  spin: {
    rest: { rotate: 0 },
    animate: { rotate: 360 },
    transition: { duration: 1, ease: "linear", repeat: Infinity },
  },
  external: {
    rest: { x: 0, y: 0, scale: 1 },
    animate: { x: [0, 3.5, 0], y: [0, -3.5, 0], scale: [1, 1.12, 1] },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  drop: {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, -5, 1, 0], scale: [1, 1.15, 0.96, 1] },
    transition: { duration: 0.45, ease: "easeOut" },
  },
  lift: {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, -3.5, 0], scale: [1, 1.1, 1] },
    transition: springQuick,
  },
  people: {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, -3, 0], scale: [1, 1.1, 1] },
    transition: { duration: 0.42, ease: "easeOut" },
  },
  play: {
    rest: { x: 0, scale: 1 },
    animate: { x: [0, 4, 0], scale: [1, 1.15, 1] },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  video: {
    rest: { scale: 1 },
    animate: { scale: [1, 1.22, 1] },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  flutter: {
    rest: { scaleX: 1 },
    animate: { scaleX: [1, 0.78, 1] },
    transition: { duration: 0.38, ease: "easeInOut" },
  },
  "thumb-up": {
    rest: { rotate: 0, scale: 1 },
    animate: { rotate: [0, 20, 0], scale: [1, 1.18, 1] },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  "thumb-down": {
    rest: { rotate: 0, scale: 1 },
    animate: { rotate: [0, -20, 0], scale: [1, 1.18, 1] },
    transition: { duration: 0.4, ease: "easeOut" },
  },
  shake: {
    rest: { rotate: 0, scale: 1 },
    animate: { rotate: [0, -14, 14, -8, 8, 0], scale: [1, 1.12, 1] },
    transition: { duration: 0.45, ease: "easeInOut" },
  },
  pulse: {
    rest: { scale: 1 },
    animate: { scale: [1, 1.24, 1] },
    transition: { duration: 0.4, ease: "easeInOut" },
  },
  bounce: {
    rest: { y: 0, scale: 1 },
    animate: { y: [0, -5, 0], scale: [1, 1.1, 1] },
    transition: springQuick,
  },
};

const ICON_MAP = new Map<unknown, AnimateIconAnimation>([
  [ArrowRight, "pointing"],
  [MoveRight, "pointing"],
  [ChevronRight, "pointing"],
  [ArrowLeft, "pointing-left"],
  [MoveLeft, "pointing-left"],
  [ChevronLeft, "pointing-left"],
  [ArrowDown, "pointing-down"],
  [ChevronDown, "pointing-down"],
  [ArrowUp, "pointing-up"],
  [ChevronUp, "pointing-up"],
  [Check, "draw"],
  [CheckCheck, "draw"],
  [CheckCircle, "draw"],
  [CheckCircle2, "draw"],
  [CircleCheck, "draw"],
  [BookOpenCheck, "draw"],
  [MailCheck, "draw"],
  [ShieldCheck, "draw"],
  [Search, "search"],
  [Sparkles, "sparkle"],
  [Star, "sparkle"],
  [Trash, "trash-lid"],
  [Trash2, "trash-lid"],
  [Bookmark, "bookmark"],
  [Send, "fly"],
  [LogOut, "fly"],
  [CloudUpload, "fly"],
  [Eye, "blink"],
  [EyeOff, "blink"],
  [RefreshCw, "rotate"],
  [RotateCw, "rotate"],
  [RotateCcw, "rotate"],
  [Loader, "spin"],
  [Loader2, "spin"],
  [LoaderCircle, "spin"],
  [ExternalLink, "external"],
  [MapPin, "drop"],
  [Building, "lift"],
  [Building2, "lift"],
  [Briefcase, "lift"],
  [BriefcaseBusiness, "lift"],
  [Banknote, "lift"],
  [User, "people"],
  [UserRound, "people"],
  [Users, "people"],
  [Play, "play"],
  [PlayCircle, "play"],
  [Video, "video"],
  [BookOpen, "flutter"],
  [ThumbsUp, "thumb-up"],
  [ThumbsDown, "thumb-down"],
  [Bell, "shake"],
  [AlertTriangle, "shake"],
  [X, "shake"],
  [Menu, "shake"],
  [Plus, "rotate"],
  [Pencil, "draw"],
  [Sun, "rotate"],
  [Moon, "pulse"],
  [Circle, "pulse"],
  [Inbox, "lift"],
  [FolderOpen, "lift"],
  [History, "rotate"],
  [FileText, "lift"],
  [Settings, "rotate"],
]);

function inferAnimation(
  iconProp?: unknown,
  iconName?: string,
  className?: string,
): AnimateIconAnimation {
  if (className?.includes("spin")) return "spin";
  if (iconProp && ICON_MAP.has(iconProp)) {
    return ICON_MAP.get(iconProp)!;
  }
  if (!iconName) return "default";

  const lower = iconName.toLowerCase();

  if (
    lower.includes("arrowright") ||
    lower.includes("moveright") ||
    lower.includes("chevronright")
  )
    return "pointing";
  if (
    lower.includes("arrowleft") ||
    lower.includes("moveleft") ||
    lower.includes("chevronleft")
  )
    return "pointing-left";
  if (lower.includes("chevrondown") || lower.includes("arrowdown"))
    return "pointing-down";
  if (lower.includes("chevronup") || lower.includes("arrowup"))
    return "pointing-up";
  if (lower.includes("check")) return "draw";
  if (lower.includes("search")) return "search";
  if (lower.includes("sparkle") || lower.includes("star")) return "sparkle";
  if (lower.includes("trash")) return "trash-lid";
  if (lower.includes("bookmark")) return "bookmark";
  if (
    lower.includes("send") ||
    lower.includes("logout") ||
    lower.includes("upload")
  )
    return "fly";
  if (lower.includes("eye")) return "blink";
  if (
    lower.includes("refresh") ||
    lower.includes("rotate") ||
    lower.includes("settings")
  )
    return "rotate";
  if (lower.includes("loader") || lower.includes("spinner")) return "spin";
  if (lower.includes("external")) return "external";
  if (lower.includes("pin") || lower.includes("map")) return "drop";
  if (
    lower.includes("briefcase") ||
    lower.includes("building") ||
    lower.includes("banknote")
  )
    return "lift";
  if (lower.includes("user") || lower.includes("people")) return "people";
  if (lower.includes("play")) return "play";
  if (lower.includes("video") || lower.includes("camera")) return "video";
  if (lower.includes("book")) return "flutter";
  if (lower.includes("thumbup") || lower.includes("thumbsup"))
    return "thumb-up";
  if (lower.includes("thumbdown") || lower.includes("thumbsdown"))
    return "thumb-down";
  if (
    lower.includes("alert") ||
    lower === "x" ||
    lower.includes("bell") ||
    lower.includes("menu")
  )
    return "shake";

  return "default";
}

/**
 * AnimateIcon — Animate UI Icon component distribution.
 * Provides micro-interactions powered by Motion on hover/tap/trigger without continuous jitter.
 */
export const AnimateIcon = forwardRef<HTMLSpanElement, AnimateIconProps>(
  function AnimateIcon(
    {
      children,
      icon: IconProp,
      animation,
      animateOnHover = true,
      animateOnTap = true,
      animateOnView,
      loop = false,
      className,
      style,
      size,
      ...props
    },
    forwardedRef,
  ) {
    const reducedMotion = useReducedMotion();
    const innerRef = useRef<HTMLSpanElement>(null);
    const spanRef =
      (forwardedRef as React.RefObject<HTMLSpanElement>) || innerRef;
    const [isHovered, setIsHovered] = useState(false);
    const [isTapped, setIsTapped] = useState(false);

    useEffect(() => {
      if (!animateOnHover && !animateOnTap) return;
      const node = spanRef.current;
      if (!node) return;

      // Detect parent button/link/card to trigger micro-interaction on button hover
      const parentInteractive = node.closest(
        'button, a, [role="button"], [role="menuitem"], .job-card, .home-feature, .sidebar-account-menu-item, .home-actions, .theme-toggle, .lp-step, .lp-run, .btn',
      );
      if (!parentInteractive) return;

      const onEnter = () => setIsHovered(true);
      const onLeave = () => setIsHovered(false);
      const onDown = () => setIsTapped(true);
      const onUp = () => setIsTapped(false);

      parentInteractive.addEventListener("mouseenter", onEnter);
      parentInteractive.addEventListener("mouseleave", onLeave);
      parentInteractive.addEventListener("pointerdown", onDown);
      parentInteractive.addEventListener("pointerup", onUp);

      return () => {
        parentInteractive.removeEventListener("mouseenter", onEnter);
        parentInteractive.removeEventListener("mouseleave", onLeave);
        parentInteractive.removeEventListener("pointerdown", onDown);
        parentInteractive.removeEventListener("pointerup", onUp);
      };
    }, [animateOnHover, animateOnTap, spanRef]);

    const iconName = useMemo(() => {
      if (IconProp) return IconProp.displayName || IconProp.name || "";
      if (isValidElement(children)) {
        const type = children.type as { displayName?: string; name?: string };
        return type.displayName || type.name || "";
      }
      return "";
    }, [IconProp, children]);

    const chosenAnimation =
      animation ||
      inferAnimation(
        IconProp || (isValidElement(children) ? children.type : undefined),
        iconName,
        className,
      );
    const isSpinning =
      chosenAnimation === "spin" || className?.includes("spin") || loop;

    const motionDefinition =
      microVariants[chosenAnimation] || microVariants.default;
    const isTriggered =
      !reducedMotion && !isSpinning && (isHovered || isTapped);

    const renderedContent = useMemo(() => {
      if (IconProp) {
        return <IconProp size={size} {...props} />;
      }
      if (isValidElement(children)) {
        return cloneElement(children as React.ReactElement<LucideProps>, {
          size: size ?? (children.props as LucideProps).size,
          ...props,
        });
      }
      return children;
    }, [IconProp, children, size, props]);

    return (
      <motion.span
        ref={spanRef}
        className={
          className ? `animate-ui-icon ${className}` : "animate-ui-icon"
        }
        aria-hidden={props["aria-label"] ? undefined : true}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          verticalAlign: "middle",
          lineHeight: 0,
          ...style,
        }}
        onMouseEnter={animateOnHover ? () => setIsHovered(true) : undefined}
        onMouseLeave={animateOnHover ? () => setIsHovered(false) : undefined}
        onPointerDown={animateOnTap ? () => setIsTapped(true) : undefined}
        onPointerUp={animateOnTap ? () => setIsTapped(false) : undefined}
        animate={
          isSpinning
            ? motionDefinition.animate
            : isTriggered
              ? motionDefinition.animate
              : motionDefinition.rest
        }
        transition={motionDefinition.transition}
        whileInView={animateOnView ? motionDefinition.animate : undefined}
      >
        {renderedContent}
      </motion.span>
    );
  },
);

/**
 * AnimatedIcon — Backward-compatible alias for existing codebase usages.
 */
export const AnimatedIcon = AnimateIcon;

/** Helper to create standalone animated icon components */
export function createAnimatedIcon(
  icon: LucideIcon,
  defaultAnimation?: AnimateIconAnimation,
) {
  return forwardRef<HTMLSpanElement, AnimateIconProps>(
    function CustomAnimatedIcon(props, ref) {
      return (
        <AnimateIcon
          ref={ref}
          icon={icon}
          animation={defaultAnimation}
          {...props}
        />
      );
    },
  );
}

export const AnimatedArrowRight = createAnimatedIcon(ArrowRight, "pointing");
export const AnimatedCheck = createAnimatedIcon(Check, "draw");
export const AnimatedSearch = createAnimatedIcon(Search, "search");
export const AnimatedTrash = createAnimatedIcon(Trash2, "trash-lid");
export const AnimatedEye = createAnimatedIcon(Eye, "blink");
export const AnimatedExternalLink = createAnimatedIcon(
  ExternalLink,
  "external",
);
export const AnimatedPlay = createAnimatedIcon(Play, "play");
export const AnimatedUsers = createAnimatedIcon(Users, "people");
export const AnimatedSparkles = createAnimatedIcon(Sparkles, "sparkle");
export const AnimatedRefresh = createAnimatedIcon(RefreshCw, "rotate");
export const AnimatedBookmark = createAnimatedIcon(Bookmark, "bookmark");
export const AnimatedSend = createAnimatedIcon(Send, "fly");
