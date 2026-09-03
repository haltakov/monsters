type Listener = (image: string | null) => void;
export type PortraitJob = { dna: string; listeners: Set<Listener> };

/** One render at a time; cached images survive closing and reopening the ledger. */
export class PortraitCache {
  private images = new Map<string, string>();
  constructor(private readonly capacity = 96) {}

  get(dna: string) {
    const image = this.images.get(dna);
    if (image) {
      this.images.delete(dna);
      this.images.set(dna, image);
    }
    return image;
  }

  put(dna: string, image: string) {
    this.images.delete(dna);
    this.images.set(dna, image);
    while (this.images.size > this.capacity) {
      this.images.delete(this.images.keys().next().value!);
    }
  }
}

export class PortraitQueue {
  private jobs = new Map<string, PortraitJob>();
  private observers = new Set<() => void>();
  private unavailable = false;

  constructor(private readonly cache: PortraitCache) {}

  subscribe = (listener: () => void) => {
    this.observers.add(listener);
    return () => {
      this.observers.delete(listener);
    };
  };
  getSnapshot = (): PortraitJob | null =>
    this.jobs.values().next().value ?? null;
  private notify() {
    this.observers.forEach((listener) => listener());
  }

  request(dna: string, listener: Listener) {
    const cached = this.cache.get(dna);
    if (cached || this.unavailable) {
      listener(cached ?? null);
      return () => {};
    }
    let job = this.jobs.get(dna);
    if (!job) {
      job = { dna, listeners: new Set() };
      this.jobs.set(dna, job);
    }
    job.listeners.add(listener);
    this.notify();
    return () => {
      job.listeners.delete(listener);
      // Don't keep generating portraits for rows scrolled out of view.
      if (!job.listeners.size && this.jobs.get(dna) === job) {
        this.jobs.delete(dna);
        this.notify();
      }
    };
  }

  complete(job: PortraitJob, image: string | null) {
    // A cancelled render must never complete a newer job for the same DNA.
    if (this.jobs.get(job.dna) !== job) return;
    this.jobs.delete(job.dna);
    if (image) this.cache.put(job.dna, image);
    job.listeners.forEach((listener) => listener(image));
    this.notify();
  }

  failAll = () => {
    this.unavailable = true;
    for (const job of [...this.jobs.values()]) this.complete(job, null);
  };
}
