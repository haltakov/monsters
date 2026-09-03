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
