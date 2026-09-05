"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { sampleJoystick } from "@/lib/touch-input";

export function Joystick({
  label,
  onMove,
  disabled = false,
}: {
  label: string;
  onMove: (x: number, y: number) => void;
  disabled?: boolean;
}) {
  const base = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const callback = useRef(onMove);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  useEffect(() => {
    callback.current = onMove;
  }, [onMove]);

  const stop = useCallback(() => {
    const id = pointer.current;
    if (id === null) return;
    pointer.current = null;
    callback.current(0, 0);
    setKnob({ x: 0, y: 0 });
    if (base.current?.hasPointerCapture(id))
      base.current.releasePointerCapture(id);
  }, []);

  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stop]);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const value = sampleJoystick(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2),
      Math.min(rect.width, rect.height) * 0.38,
    );
    setKnob({ x: value.knobX, y: value.knobY });
    callback.current(value.x, value.y);
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (disabled || pointer.current !== null || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        event.stopPropagation();
        if (disabled) stop();
        else update(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (pointer.current === event.pointerId) stop();
      }}
      onPointerCancel={(event) => {
        if (pointer.current === event.pointerId) stop();
      }}
      onLostPointerCapture={(event) => {
        if (pointer.current === event.pointerId) stop();
      }}
    >
      <span className="joystick-label">{label}</span>
      <div
        className="joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

/** Pointer capture lets one thumb keep walking while another swipes the world. */
export function WorldInputSurface({
  disabled,
  onInteract,
  onSwipe,
  children,
}: {
  disabled: boolean;
  onInteract: () => void;
  onSwipe: (dx: number, dy: number) => void;
  children: ReactNode;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const stop = useCallback(() => {
    const id = drag.current?.id;
    drag.current = null;
    if (id !== undefined && surface.current?.hasPointerCapture(id)) {
      surface.current.releasePointerCapture(id);
    }
  }, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stop]);

  const blocked = () =>
    disabled || Boolean(document.querySelector('[role="dialog"]'));

  return (
    <div
      ref={surface}
      className="world-input-surface"
      onPointerDown={(event) => {
        if (blocked() || !(event.target instanceof HTMLCanvasElement)) return;
        onInteract();
        if (event.pointerType === "mouse") {
          if (!document.pointerLockElement) {
            try {
              void event.target.requestPointerLock()?.catch(() => undefined);
            } catch {
              // Some browsers deny pointer lock; touch input remains available.
            }
          }
          return;
        }
        if (drag.current || !["touch", "pen"].includes(event.pointerType))
          return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active || active.id !== event.pointerId) return;
        if (blocked()) {
          stop();
          return;
        }
        onSwipe(event.clientX - active.x, event.clientY - active.y);
        active.x = event.clientX;
        active.y = event.clientY;
      }}
      onPointerUp={(event) => {
        if (drag.current?.id === event.pointerId) stop();
      }}
      onPointerCancel={(event) => {
        if (drag.current?.id === event.pointerId) stop();
      }}
      onLostPointerCapture={(event) => {
        if (drag.current?.id === event.pointerId) stop();
      }}
    >
      {children}
    </div>
  );
}

/** A held action always releases on cancellation, focus loss, or unmount. */
export function HoldButton({
  label,
  shortcut,
  onHold,
  disabled = false,
}: {
  label: string;
  shortcut: string;
  onHold: (held: boolean) => void;
  disabled?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const callback = useRef(onHold);
  useEffect(() => {
    callback.current = onHold;
  }, [onHold]);
  const release = useCallback(() => {
    pointer.current = null;
    callback.current(false);
  }, []);
  useEffect(() => {
    if (disabled) release();
  }, [disabled, release]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) release();
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      release();
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [release]);
  return (
    <button
      ref={button}
      type="button"
      className="ability-button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        callback.current(true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          callback.current(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") release();
      }}
    >
      <span>{label}</span>
      <small>{shortcut}</small>
    </button>
  );
}
