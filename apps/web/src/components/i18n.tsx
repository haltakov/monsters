"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const LOCALES = ["bg", "de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  "language.label": "Language",
  "language.bg": "Bulgarian",
  "language.de": "German",
  "language.en": "English",
  "meta.homeTitle": "Monsters — grow a tiny wild world",
  "meta.gameTitle": "Island prototype · Monsters",
  "landing.home": "Monsters home",
  "landing.enter": "Enter the island",
  "landing.playShort": "PLAY",
  "landing.eyebrow": "FIELD NOTES · DAY ONE",
  "landing.titleOne": "A small world.",
  "landing.titleTwo": "Infinite little weirdos.",
  "landing.lede":
    "Grow monsters from wild DNA, then watch them explore, adapt, make friends—or decide that lunch has legs.",
  "landing.play": "Play the prototype",
  "landing.note": "No account. No saving. Just play.",
  "landing.diorama": "A tiny monster island illustration",
  "landing.specimen": "SPECIMEN 001",
  "landing.specimenName": "MOSS MUNCHER",
  "landing.specimenTraits": "friendly · hungry · surprisingly fast",
  "landing.features": "Game features",
  "landing.dnaTitle": "DNA makes the monster",
  "landing.dnaBody": "Eyes, legs, appetite, speed, instincts.",
  "landing.tracksTitle": "Every choice leaves tracks",
  "landing.tracksBody": "Hunt, graze, gather, wander, survive.",
  "landing.worldTitle": "The world grows with them",
  "landing.worldBody": "A living island we’ll build together.",
  "landing.footer":
    "Built by a dad, his son, and a lot of curious creatures.",
  "landing.version": "Prototype 0.1",
  "loading.island": "Growing the island…",
  "loading.creator": "Opening the DNA lab…",
  "creator.kicker": "DNA LAB · SPECIMEN 001",
  "creator.title": "Build your monster",
  "creator.close": "Close creator",
  "creator.live": "LIVE SPECIMEN",
  "creator.rotate": "Drag to rotate · scroll to zoom",
  "creator.eye": "eye",
  "creator.eyes": "eyes",
  "creator.legs": "legs",
  "creator.followers": "followers",
  "creator.solo": "solo",
  "creator.builder": "CHARACTER BUILDER",
  "creator.builderHint": "Every choice writes one gene.",
  "creator.surprise": "Surprise me",
  "creator.guide": "FIELD GUIDE · ANIMAL-LIKE STARTERS",
  "creator.guideHint": "Choose one, then change any gene.",
  "creator.name": "Monster name",
  "creator.namePlaceholder": "Give this monster a name",
  "creator.body": "Body shape",
  "creator.diet": "Diet",
  "creator.breathing": "Breathing",
  "creator.social": "Social behavior",
  "creator.size": "Size",
  "creator.legCount": "Number of legs",
  "creator.legShape": "Leg shape",
  "creator.eyeCount": "Number of eyes",
  "creator.mouth": "Mouth",
  "creator.pattern": "Pattern",
  "creator.horns": "Horns",
  "creator.tail": "Tail",
  "creator.adaptation": "Special adaptation",
  "creator.bodyColor": "Body color",
  "creator.accentColor": "Accent color",
  "creator.directDna": "DIRECT DNA EDITOR",
  "creator.dnaHelp":
    "M4 stores all 15 genes. Old M1–M3 codes still work and are upgraded automatically.",
  "creator.invalidDna": "This DNA code is invalid or incomplete.",
  "creator.footer": "15 genes · anatomy + breathing + social behavior",
  "creator.keep": "Keep current monster",
  "creator.apply": "Play as this monster",
  "option.round": "Round",
  "option.bean": "Bean",
  "option.long": "Long",
  "option.pig": "Pig",
  "option.biped": "Humanoid",
  "option.saurian": "Dinosaur",
  "option.rhino": "Rhino",
  "option.aquatic": "Aquatic",
  "option.stubby": "Stubby",
  "option.hoof": "Hooves",
  "option.springy": "Springy",
  "option.clawed": "Clawed",
  "option.flippers": "Flippers",
  "option.smile": "Smile",
  "option.fangs": "Fangs",
  "option.beak": "Beak",
  "option.snout": "Snout",
  "option.tusks": "Tusks",
  "option.small": "Small",
  "option.medium": "Medium",
  "option.large": "Large",
  "option.plain": "Plain",
  "option.spots": "Spots",
  "option.stripes": "Stripes",
  "option.patches": "Patches",
  "option.scales": "Scales",
  "option.none": "None",
  "option.buds": "Buds",
  "option.spikes": "Spikes",
  "option.antlers": "Antlers",
  "option.tuft": "Tuft",
  "option.curly": "Curly",
  "option.club": "Club",
  "option.fin": "Tail fin",
  "option.fins": "Fins",
  "option.wings": "Wings",
  "option.shell": "Shell",
  "option.plates": "Back plates",
  "option.herbivore": "Herbivore",
  "option.carnivore": "Carnivore",
  "option.omnivore": "Omnivore",
  "option.lungs": "Lungs",
  "option.gills": "Gills",
  "option.both": "Lungs + gills",
  "option.solitary": "Solitary",
  "option.pair": "Pair",
  "option.pack": "Pack",
  "option.army": "Small army",
  "option.moss": "Moss",
  "option.berry": "Berry",
  "option.lagoon": "Lagoon",
  "option.mango": "Mango",
  "option.coral": "Coral",
  "option.moon": "Moon",
  "option.midnight": "Midnight",
  "option.glacier": "Glacier",
  "option.ember": "Ember",
  "option.bubblegum": "Bubblegum",
  "option.cocoa": "Cocoa",
  "option.lime": "Lime",
  "option.peach": "Peach",
  "option.lemon": "Lemon",
  "option.mint": "Mint",
  "option.sky": "Sky",
  "option.pink": "Pink",
  "option.cream": "Cream",
  "option.violet": "Violet",
  "option.cherry": "Cherry",
  "option.aqua": "Aqua",
  "option.white": "White",
  "archetype.gorilla.label": "Gorilla-like",
  "archetype.gorilla.summary":
    "Large, strong omnivore that stays with one companion.",
  "archetype.shark.label": "Shark-like",
  "archetype.shark.summary":
    "A solitary ocean hunter with gills and powerful fins.",
  "archetype.seagull.label": "Seagull-like",
  "archetype.seagull.summary":
    "A small winged omnivore that travels in a noisy pack.",
  "archetype.rhino.label": "Rhino-like",
  "archetype.rhino.summary":
    "A large solitary herbivore with hooves and a nose horn.",
  "archetype.raptor.label": "Raptor-like",
  "archetype.raptor.summary":
    "A fast clawed carnivore that hunts with a small pack.",
  "archetype.dragon.label": "Dragon-like",
  "archetype.dragon.summary":
    "A huge winged predator; dangerous enough to live alone.",
  "archetype.beetle.label": "Beetle-like",
  "archetype.beetle.summary":
    "A tiny six-legged herbivore protected by a shell army.",
  "archetype.octopus.label": "Octopus-like",
  "archetype.octopus.summary":
    "A clever eight-limbed omnivore that breathes with gills.",
  "archetype.frog.label": "Frog-like",
  "archetype.frog.summary":
    "A small amphibious omnivore with springy legs and friends.",
  "archetype.boar.label": "Boar-like",
  "archetype.boar.summary":
    "A tough tusked omnivore that moves with a family group.",
  "game.home": "Back to home",
  "game.explorer": "level 1 explorer",
  "game.monster": "Monster",
  "game.new": "New",
  "game.edit": "Edit monster",
  "game.energy": "ENERGY",
  "game.movementMode": "MOVEMENT",
  "game.mode.land": "Walking",
  "game.mode.swim": "Swimming",
  "game.mode.dive": "Underwater",
  "game.mode.fly": "Flying",
  "game.flyLand": "take off / land",
  "game.diveSurface": "dive / surface",
  "game.flyButton": "Take off",
  "game.landButton": "Land",
  "game.diveButton": "Dive",
  "game.surfaceButton": "Surface",
  "game.tookOff": "Wings beating — you are flying!",
  "game.landed": "Back safely on the ground.",
  "game.cannotLandWater": "There is water below. This monster cannot land here.",
  "game.dived": "Diving beneath the waves.",
  "game.surfaced": "Back at the surface.",
  "game.findDeepWater": "Enter the deep sea before diving.",
  "game.outOfEnergy": "OUT OF ENERGY",
  "game.collapsed": "{{name}} has collapsed!",
  "game.deathHint":
    "Walk to forage, sprint carefully, and save energy for attacks.",
  "game.tryAgain": "Try again",
  "game.mouseHint": "Click the world to look around",
  "game.forwardBack": "forward / back",
  "game.sideways": "face + move sideways",
  "game.camera": "camera",
  "game.turnCamera": "turn + camera",
  "game.eat": "eat",
  "game.attack": "attack",
  "game.sprint": "sprint",
  "game.move": "MOVE",
  "game.look": "LOOK",
  "game.eatButton": "Eat",
  "game.huntButton": "Hunt",
  "game.attackButton": "Attack",
  "game.space": "Space",
  "game.waterOpen": "Aquatic DNA: rivers and sea are open.",
  "game.waterClosed": "Water is off limits. Look for a bridge.",
  "game.welcome": "Welcome to Mossmunch Island",
  "game.ranOut": "{{name}} ran out of energy.",
  "game.carnivoreFeast": "Carnivore feast! +{{energy}} energy",
  "game.omnivoreSnack": "Omnivore snack! +{{energy}} energy",
  "game.noPrey":
    "No prey in range. The attack still cost {{cost}} energy.",
  "game.herbivoreAttack":
    "Herbivores attack only to defend themselves. −{{cost}} energy",
  "game.noPlants": "Carnivores cannot digest plants. Hunt a small critter.",
  "game.energyFull": "Energy is already full.",
  "game.getCloser": "Get closer to a bush or tree to eat.",
  "game.crunchyBush": "Crunchy bush! +{{energy}} energy",
  "game.tastyTree": "Tasty tree! +{{energy}} energy",
  "game.explore": "Explore the island",
  "game.ready": "{{name}} is ready to explore again!",
  "game.familyFull": "The family can hold up to {{count}} monsters.",
  "game.genericMonster": "Monster",
  "game.joined": "{{name}} joined the monster family!",
  "game.dnaReady": "{{name}}’s new DNA is ready to test!",
  "game.nowPlaying": "Now playing as {{name}}.",
} as const;

export type TranslationKey = keyof typeof en;

const bg: Record<TranslationKey, string> = {
  "language.label": "Език",
  "language.bg": "Български",
  "language.de": "Немски",
  "language.en": "Английски",
  "meta.homeTitle": "Monsters — отгледай малък див свят",
  "meta.gameTitle": "Островен прототип · Monsters",
  "landing.home": "Начална страница на Monsters",
  "landing.enter": "Влез на острова",
  "landing.playShort": "ИГРАЙ",
  "landing.eyebrow": "ПОЛЕВИ БЕЛЕЖКИ · ДЕН ПЪРВИ",
  "landing.titleOne": "Един малък свят.",
  "landing.titleTwo": "Безброй чудати създания.",
  "landing.lede":
    "Създавай чудовища от дива DNA, после ги гледай как изследват, приспособяват се, сприятеляват се — или решават, че обядът има крака.",
  "landing.play": "Играй прототипа",
  "landing.note": "Без профил. Без запазване. Просто играй.",
  "landing.diorama": "Илюстрация на малък остров с чудовища",
  "landing.specimen": "ЕКЗЕМПЛЯР 001",
  "landing.specimenName": "МЪХЕСТИЯТ ЛАКОМНИК",
  "landing.specimenTraits": "дружелюбен · гладен · изненадващо бърз",
  "landing.features": "Особености на играта",
  "landing.dnaTitle": "DNA създава чудовището",
  "landing.dnaBody": "Очи, крака, апетит, скорост, инстинкти.",
  "landing.tracksTitle": "Всеки избор оставя следи",
  "landing.tracksBody": "Ловувай, паси, събирай, скитай, оцелявай.",
  "landing.worldTitle": "Светът расте заедно с тях",
  "landing.worldBody": "Жив остров, който ще построим заедно.",
  "landing.footer":
    "Създадено от един татко, неговия син и много любопитни създания.",
  "landing.version": "Прототип 0.1",
  "loading.island": "Островът расте…",
  "loading.creator": "DNA лабораторията се отваря…",
  "creator.kicker": "DNA ЛАБОРАТОРИЯ · ЕКЗЕМПЛЯР 001",
  "creator.title": "Създай своето чудовище",
  "creator.close": "Затвори създателя",
  "creator.live": "ЖИВ ЕКЗЕМПЛЯР",
  "creator.rotate": "Плъзни за завъртане · превърти за увеличение",
  "creator.eye": "око",
  "creator.eyes": "очи",
  "creator.legs": "крака",
  "creator.followers": "последователи",
  "creator.solo": "самò",
  "creator.builder": "СЪЗДАТЕЛ НА ГЕРОЙ",
  "creator.builderHint": "Всеки избор записва един ген.",
  "creator.surprise": "Изненадай ме",
  "creator.guide": "ПОЛЕВИ СПРАВОЧНИК · ЖИВОТИНСКИ ВИДОВЕ",
  "creator.guideHint": "Избери вид, после промени който искаш ген.",
  "creator.name": "Име на чудовището",
  "creator.namePlaceholder": "Дай име на това чудовище",
  "creator.body": "Форма на тялото",
  "creator.diet": "Хранене",
  "creator.breathing": "Дишане",
  "creator.social": "Социално поведение",
  "creator.size": "Размер",
  "creator.legCount": "Брой крака",
  "creator.legShape": "Форма на краката",
  "creator.eyeCount": "Брой очи",
  "creator.mouth": "Уста",
  "creator.pattern": "Шарка",
  "creator.horns": "Рога",
  "creator.tail": "Опашка",
  "creator.adaptation": "Специално приспособление",
  "creator.bodyColor": "Цвят на тялото",
  "creator.accentColor": "Допълнителен цвят",
  "creator.directDna": "ДИРЕКТНО РЕДАКТИРАНЕ НА DNA",
  "creator.dnaHelp":
    "M4 пази всичките 15 гена. Старите M1–M3 кодове също работят и се обновяват автоматично.",
  "creator.invalidDna": "Този DNA код е невалиден или непълен.",
  "creator.footer": "15 гена · анатомия + дишане + социално поведение",
  "creator.keep": "Запази сегашното чудовище",
  "creator.apply": "Играй с това чудовище",
  "option.round": "Кръгло",
  "option.bean": "Бобче",
  "option.long": "Удължено",
  "option.pig": "Прасенце",
  "option.biped": "Човекоподобно",
  "option.saurian": "Динозавър",
  "option.rhino": "Носорог",
  "option.aquatic": "Водно",
  "option.stubby": "Къси",
  "option.hoof": "Копита",
  "option.springy": "Пружиниращи",
  "option.clawed": "С нокти",
  "option.flippers": "Плавници",
  "option.smile": "Усмивка",
  "option.fangs": "Зъби",
  "option.beak": "Човка",
  "option.snout": "Муцуна",
  "option.tusks": "Бивни",
  "option.small": "Малко",
  "option.medium": "Средно",
  "option.large": "Голямо",
  "option.plain": "Без шарка",
  "option.spots": "Точки",
  "option.stripes": "Райета",
  "option.patches": "Петна",
  "option.scales": "Люспи",
  "option.none": "Няма",
  "option.buds": "Зачатъци",
  "option.spikes": "Шипове",
  "option.antlers": "Разклонени рога",
  "option.tuft": "Кичур",
  "option.curly": "Навита",
  "option.club": "Бухалка",
  "option.fin": "Опашна перка",
  "option.fins": "Перки",
  "option.wings": "Крила",
  "option.shell": "Черупка",
  "option.plates": "Гръбни плочки",
  "option.herbivore": "Тревопасно",
  "option.carnivore": "Месоядно",
  "option.omnivore": "Всеядно",
  "option.lungs": "Бели дробове",
  "option.gills": "Хриле",
  "option.both": "Дробове + хриле",
  "option.solitary": "Самотно",
  "option.pair": "Двойка",
  "option.pack": "Група",
  "option.army": "Малка армия",
  "option.moss": "Мъх",
  "option.berry": "Горски плод",
  "option.lagoon": "Лагуна",
  "option.mango": "Манго",
  "option.coral": "Корал",
  "option.moon": "Луна",
  "option.midnight": "Полунощ",
  "option.glacier": "Ледник",
  "option.ember": "Жар",
  "option.bubblegum": "Дъвка",
  "option.cocoa": "Какао",
  "option.lime": "Лайм",
  "option.peach": "Праскова",
  "option.lemon": "Лимон",
  "option.mint": "Мента",
  "option.sky": "Небе",
  "option.pink": "Розово",
  "option.cream": "Кремаво",
  "option.violet": "Виолетово",
  "option.cherry": "Череша",
  "option.aqua": "Аква",
  "option.white": "Бяло",
  "archetype.gorilla.label": "Горилоподобно",
  "archetype.gorilla.summary":
    "Голямо и силно всеядно, което живее с един другар.",
  "archetype.shark.label": "Акулоподобно",
  "archetype.shark.summary":
    "Самотен морски ловец с хриле и мощни перки.",
  "archetype.seagull.label": "Чайкоподобно",
  "archetype.seagull.summary":
    "Малко крилато всеядно, което пътува в шумна група.",
  "archetype.rhino.label": "Носорогоподобно",
  "archetype.rhino.summary":
    "Голямо самотно тревопасно с копита и рог на носа.",
  "archetype.raptor.label": "Раптороподобно",
  "archetype.raptor.summary":
    "Бързо месоядно с нокти, което ловува в малка група.",
  "archetype.dragon.label": "Драконоподобно",
  "archetype.dragon.summary":
    "Огромен крилат хищник, достатъчно опасен да живее сам.",
  "archetype.beetle.label": "Бръмбароподобно",
  "archetype.beetle.summary":
    "Дребно шестокрако тревопасно, защитено от армия с черупки.",
  "archetype.octopus.label": "Подобно на октопод",
  "archetype.octopus.summary":
    "Умно осемкрако всеядно, което диша с хриле.",
  "archetype.frog.label": "Жабоподобно",
  "archetype.frog.summary":
    "Малко земноводно всеядно с пружиниращи крака и приятели.",
  "archetype.boar.label": "Глиганоподобно",
  "archetype.boar.summary":
    "Издръжливо всеядно с бивни, което се движи със семейна група.",
  "game.home": "Към началната страница",
  "game.explorer": "изследовател · ниво 1",
  "game.monster": "Чудовище",
  "game.new": "Ново",
  "game.edit": "Промени",
  "game.energy": "ЕНЕРГИЯ",
  "game.movementMode": "ДВИЖЕНИЕ",
  "game.mode.land": "Ходене",
  "game.mode.swim": "Плуване",
  "game.mode.dive": "Под вода",
  "game.mode.fly": "Летене",
  "game.flyLand": "излитане / кацане",
  "game.diveSurface": "гмуркане / изплуване",
  "game.flyButton": "Излети",
  "game.landButton": "Кацни",
  "game.diveButton": "Гмурни се",
  "game.surfaceButton": "Изплувай",
  "game.tookOff": "Крилата се размахаха — вече летиш!",
  "game.landed": "Кацна безопасно на земята.",
  "game.cannotLandWater":
    "Отдолу има вода. Това чудовище не може да кацне тук.",
  "game.dived": "Гмурна се под вълните.",
  "game.surfaced": "Отново си на повърхността.",
  "game.findDeepWater": "Влез в дълбокото море, за да се гмурнеш.",
  "game.outOfEnergy": "НЯМА ЕНЕРГИЯ",
  "game.collapsed": "{{name}} припадна!",
  "game.deathHint":
    "Ходи, за да търсиш храна, спринтирай внимателно и пази енергия за атаки.",
  "game.tryAgain": "Опитай отново",
  "game.mouseHint": "Щракни върху света, за да оглеждаш",
  "game.forwardBack": "напред / назад",
  "game.sideways": "обърни се + ходи встрани",
  "game.camera": "камера",
  "game.turnCamera": "завъртане + камера",
  "game.eat": "яж",
  "game.attack": "атакувай",
  "game.sprint": "спринт",
  "game.move": "ДВИЖЕНИЕ",
  "game.look": "ОГЛЕЖДАНЕ",
  "game.eatButton": "Яж",
  "game.huntButton": "Ловувай",
  "game.attackButton": "Атакувай",
  "game.space": "Интервал",
  "game.waterOpen": "Водно DNA: реките и морето са достъпни.",
  "game.waterClosed": "Водата е забранена. Потърси мост.",
  "game.welcome": "Добре дошъл на остров Мъхльо",
  "game.ranOut": "{{name}} остана без енергия.",
  "game.carnivoreFeast": "Месоядно пиршество! +{{energy}} енергия",
  "game.omnivoreSnack": "Всеядна закуска! +{{energy}} енергия",
  "game.noPrey":
    "Няма плячка наблизо. Атаката все пак струва {{cost}} енергия.",
  "game.herbivoreAttack":
    "Тревопасните атакуват само за защита. −{{cost}} енергия",
  "game.noPlants":
    "Месоядните не могат да смилат растения. Намери малко животинче.",
  "game.energyFull": "Енергията вече е пълна.",
  "game.getCloser": "Приближи се до храст или дърво, за да ядеш.",
  "game.crunchyBush": "Хрупкав храст! +{{energy}} енергия",
  "game.tastyTree": "Вкусно дърво! +{{energy}} енергия",
  "game.explore": "Изследвай острова",
  "game.ready": "{{name}} отново е готово за приключения!",
  "game.familyFull": "Семейството може да има до {{count}} чудовища.",
  "game.genericMonster": "Чудовище",
  "game.joined": "{{name}} се присъедини към семейството!",
  "game.dnaReady": "Новото DNA на {{name}} е готово за тест!",
  "game.nowPlaying": "Сега играеш с {{name}}.",
};

const de: Record<TranslationKey, string> = {
  "language.label": "Sprache",
  "language.bg": "Bulgarisch",
  "language.de": "Deutsch",
  "language.en": "Englisch",
  "meta.homeTitle": "Monsters — erschaffe eine kleine wilde Welt",
  "meta.gameTitle": "Insel-Prototyp · Monsters",
  "landing.home": "Monsters Startseite",
  "landing.enter": "Zur Insel",
  "landing.playShort": "SPIELEN",
  "landing.eyebrow": "FELDNOTIZEN · TAG EINS",
  "landing.titleOne": "Eine kleine Welt.",
  "landing.titleTwo": "Unendlich viele kleine Sonderlinge.",
  "landing.lede":
    "Erschaffe Monster aus wilder DNA und beobachte, wie sie erkunden, sich anpassen, Freunde finden – oder beschließen, dass das Mittagessen Beine hat.",
  "landing.play": "Prototyp spielen",
  "landing.note": "Kein Konto. Kein Speichern. Einfach spielen.",
  "landing.diorama": "Illustration einer kleinen Monsterinsel",
  "landing.specimen": "EXEMPLAR 001",
  "landing.specimenName": "MOOSMÜMMELER",
  "landing.specimenTraits": "freundlich · hungrig · überraschend schnell",
  "landing.features": "Spielfunktionen",
  "landing.dnaTitle": "DNA formt das Monster",
  "landing.dnaBody": "Augen, Beine, Appetit, Tempo, Instinkte.",
  "landing.tracksTitle": "Jede Wahl hinterlässt Spuren",
  "landing.tracksBody": "Jagen, grasen, sammeln, wandern, überleben.",
  "landing.worldTitle": "Die Welt wächst mit ihnen",
  "landing.worldBody": "Eine lebendige Insel, die wir gemeinsam bauen.",
  "landing.footer":
    "Gebaut von einem Vater, seinem Sohn und vielen neugierigen Wesen.",
  "landing.version": "Prototyp 0.1",
  "loading.island": "Die Insel wächst…",
  "loading.creator": "Das DNA-Labor öffnet…",
  "creator.kicker": "DNA-LABOR · EXEMPLAR 001",
  "creator.title": "Baue dein Monster",
  "creator.close": "Monsterbau schließen",
  "creator.live": "LEBENDES EXEMPLAR",
  "creator.rotate": "Ziehen zum Drehen · scrollen zum Zoomen",
  "creator.eye": "Auge",
  "creator.eyes": "Augen",
  "creator.legs": "Beine",
  "creator.followers": "Begleiter",
  "creator.solo": "allein",
  "creator.builder": "MONSTERBAUKASTEN",
  "creator.builderHint": "Jede Wahl schreibt ein Gen.",
  "creator.surprise": "Überrasch mich",
  "creator.guide": "FELDFÜHRER · TIERISCHE STARTFORMEN",
  "creator.guideHint": "Wähle eine Form und ändere danach jedes Gen.",
  "creator.name": "Monstername",
  "creator.namePlaceholder": "Gib diesem Monster einen Namen",
  "creator.body": "Körperform",
  "creator.diet": "Ernährung",
  "creator.breathing": "Atmung",
  "creator.social": "Sozialverhalten",
  "creator.size": "Größe",
  "creator.legCount": "Anzahl der Beine",
  "creator.legShape": "Beinform",
  "creator.eyeCount": "Anzahl der Augen",
  "creator.mouth": "Mund",
  "creator.pattern": "Muster",
  "creator.horns": "Hörner",
  "creator.tail": "Schwanz",
  "creator.adaptation": "Besondere Anpassung",
  "creator.bodyColor": "Körperfarbe",
  "creator.accentColor": "Akzentfarbe",
  "creator.directDna": "DNA DIREKT BEARBEITEN",
  "creator.dnaHelp":
    "M4 speichert alle 15 Gene. Alte M1–M3-Codes funktionieren weiterhin und werden automatisch aktualisiert.",
  "creator.invalidDna": "Dieser DNA-Code ist ungültig oder unvollständig.",
  "creator.footer": "15 Gene · Anatomie + Atmung + Sozialverhalten",
  "creator.keep": "Aktuelles Monster behalten",
  "creator.apply": "Mit diesem Monster spielen",
  "option.round": "Rund",
  "option.bean": "Bohne",
  "option.long": "Lang",
  "option.pig": "Schwein",
  "option.biped": "Menschenähnlich",
  "option.saurian": "Dinosaurier",
  "option.rhino": "Nashorn",
  "option.aquatic": "Wassertier",
  "option.stubby": "Stummelig",
  "option.hoof": "Hufe",
  "option.springy": "Sprungkräftig",
  "option.clawed": "Mit Krallen",
  "option.flippers": "Flossen",
  "option.smile": "Lächeln",
  "option.fangs": "Fangzähne",
  "option.beak": "Schnabel",
  "option.snout": "Schnauze",
  "option.tusks": "Hauer",
  "option.small": "Klein",
  "option.medium": "Mittel",
  "option.large": "Groß",
  "option.plain": "Einfarbig",
  "option.spots": "Punkte",
  "option.stripes": "Streifen",
  "option.patches": "Flecken",
  "option.scales": "Schuppen",
  "option.none": "Keine",
  "option.buds": "Knospen",
  "option.spikes": "Stacheln",
  "option.antlers": "Geweih",
  "option.tuft": "Büschel",
  "option.curly": "Geringelt",
  "option.club": "Keule",
  "option.fin": "Schwanzflosse",
  "option.fins": "Flossen",
  "option.wings": "Flügel",
  "option.shell": "Panzer",
  "option.plates": "Rückenplatten",
  "option.herbivore": "Pflanzenfresser",
  "option.carnivore": "Fleischfresser",
  "option.omnivore": "Allesfresser",
  "option.lungs": "Lungen",
  "option.gills": "Kiemen",
  "option.both": "Lungen + Kiemen",
  "option.solitary": "Einzelgänger",
  "option.pair": "Paar",
  "option.pack": "Gruppe",
  "option.army": "Kleine Armee",
  "option.moss": "Moos",
  "option.berry": "Beere",
  "option.lagoon": "Lagune",
  "option.mango": "Mango",
  "option.coral": "Koralle",
  "option.moon": "Mond",
  "option.midnight": "Mitternacht",
  "option.glacier": "Gletscher",
  "option.ember": "Glut",
  "option.bubblegum": "Kaugummi",
  "option.cocoa": "Kakao",
  "option.lime": "Limette",
  "option.peach": "Pfirsich",
  "option.lemon": "Zitrone",
  "option.mint": "Minze",
  "option.sky": "Himmel",
  "option.pink": "Rosa",
  "option.cream": "Creme",
  "option.violet": "Violett",
  "option.cherry": "Kirsche",
  "option.aqua": "Aqua",
  "option.white": "Weiß",
  "archetype.gorilla.label": "Gorillaartig",
  "archetype.gorilla.summary":
    "Großer, starker Allesfresser mit einem einzigen Begleiter.",
  "archetype.shark.label": "Haiartig",
  "archetype.shark.summary":
    "Ein einsamer Meeresjäger mit Kiemen und kräftigen Flossen.",
  "archetype.seagull.label": "Möwenartig",
  "archetype.seagull.summary":
    "Ein kleiner geflügelter Allesfresser, der in einer lauten Gruppe reist.",
  "archetype.rhino.label": "Nashornartig",
  "archetype.rhino.summary":
    "Ein großer einzelgängerischer Pflanzenfresser mit Hufen und Nasenhorn.",
  "archetype.raptor.label": "Raptorartig",
  "archetype.raptor.summary":
    "Ein schneller Fleischfresser mit Krallen, der in kleiner Gruppe jagt.",
  "archetype.dragon.label": "Drachenartig",
  "archetype.dragon.summary":
    "Ein riesiger geflügelter Jäger, gefährlich genug für ein Leben allein.",
  "archetype.beetle.label": "Käferartig",
  "archetype.beetle.summary":
    "Ein winziger sechsbeiniger Pflanzenfresser mit einer Panzerarmee.",
  "archetype.octopus.label": "Krakenartig",
  "archetype.octopus.summary":
    "Ein kluger achtgliedriger Allesfresser, der mit Kiemen atmet.",
  "archetype.frog.label": "Froschartig",
  "archetype.frog.summary":
    "Ein kleiner amphibischer Allesfresser mit Sprungbeinen und Freunden.",
  "archetype.boar.label": "Wildschweinartig",
  "archetype.boar.summary":
    "Ein robuster Allesfresser mit Hauern, der in einer Familiengruppe lebt.",
  "game.home": "Zur Startseite",
  "game.explorer": "Entdecker · Stufe 1",
  "game.monster": "Monster",
  "game.new": "Neu",
  "game.edit": "Bearbeiten",
  "game.energy": "ENERGIE",
  "game.movementMode": "BEWEGUNG",
  "game.mode.land": "Gehen",
  "game.mode.swim": "Schwimmen",
  "game.mode.dive": "Unter Wasser",
  "game.mode.fly": "Fliegen",
  "game.flyLand": "starten / landen",
  "game.diveSurface": "tauchen / auftauchen",
  "game.flyButton": "Starten",
  "game.landButton": "Landen",
  "game.diveButton": "Tauchen",
  "game.surfaceButton": "Auftauchen",
  "game.tookOff": "Die Flügel schlagen — du fliegst!",
  "game.landed": "Sicher auf dem Boden gelandet.",
  "game.cannotLandWater":
    "Unter dir ist Wasser. Dieses Monster kann hier nicht landen.",
  "game.dived": "Du tauchst unter die Wellen.",
  "game.surfaced": "Zurück an der Oberfläche.",
  "game.findDeepWater": "Gehe zum tiefen Meer, bevor du tauchst.",
  "game.outOfEnergy": "KEINE ENERGIE",
  "game.collapsed": "{{name}} ist zusammengebrochen!",
  "game.deathHint":
    "Gehe auf Nahrungssuche, sprinte vorsichtig und spare Energie für Angriffe.",
  "game.tryAgain": "Nochmal versuchen",
  "game.mouseHint": "Klicke in die Welt, um dich umzusehen",
  "game.forwardBack": "vorwärts / rückwärts",
  "game.sideways": "drehen + seitwärts gehen",
  "game.camera": "Kamera",
  "game.turnCamera": "drehen + Kamera",
  "game.eat": "fressen",
  "game.attack": "angreifen",
  "game.sprint": "sprinten",
  "game.move": "BEWEGEN",
  "game.look": "UMSEHEN",
  "game.eatButton": "Fressen",
  "game.huntButton": "Jagen",
  "game.attackButton": "Angreifen",
  "game.space": "Leertaste",
  "game.waterOpen": "Wasser-DNA: Flüsse und Meer sind offen.",
  "game.waterClosed": "Wasser ist gesperrt. Suche eine Brücke.",
  "game.welcome": "Willkommen auf der Moosmümmel-Insel",
  "game.ranOut": "{{name}} hat keine Energie mehr.",
  "game.carnivoreFeast": "Fleischfresser-Fest! +{{energy}} Energie",
  "game.omnivoreSnack": "Allesfresser-Snack! +{{energy}} Energie",
  "game.noPrey":
    "Keine Beute in Reichweite. Der Angriff kostete trotzdem {{cost}} Energie.",
  "game.herbivoreAttack":
    "Pflanzenfresser greifen nur zur Verteidigung an. −{{cost}} Energie",
  "game.noPlants":
    "Fleischfresser können Pflanzen nicht verdauen. Jage ein kleines Tier.",
  "game.energyFull": "Die Energie ist bereits voll.",
  "game.getCloser": "Gehe näher an einen Busch oder Baum, um zu fressen.",
  "game.crunchyBush": "Knackiger Busch! +{{energy}} Energie",
  "game.tastyTree": "Leckerer Baum! +{{energy}} Energie",
  "game.explore": "Erkunde die Insel",
  "game.ready": "{{name}} ist wieder bereit zum Erkunden!",
  "game.familyFull": "Die Familie kann bis zu {{count}} Monster aufnehmen.",
  "game.genericMonster": "Monster",
  "game.joined": "{{name}} ist der Monsterfamilie beigetreten!",
  "game.dnaReady": "Die neue DNA von {{name}} kann getestet werden!",
  "game.nowPlaying": "Du spielst jetzt als {{name}}.",
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  bg,
  de,
  en,
};

type TranslationValues = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  option: (value: string | number) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const LANGUAGE_STORAGE_KEY = "monsters-language";
const LANGUAGE_EVENT = "monsters-language-change";

function getBrowserLocale(): Locale {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved && LOCALES.includes(saved as Locale) ? (saved as Locale) : "bg";
}

function subscribeToLanguage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LANGUAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LANGUAGE_EVENT, onChange);
  };
}

function getServerLocale(): Locale {
  return "bg";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLanguage,
    getBrowserLocale,
    getServerLocale,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => {
      let result = dictionaries[locale][key];
      if (values) {
        Object.entries(values).forEach(([name, value]) => {
          result = result.replaceAll(`{{${name}}}`, String(value));
        });
      }
      return result;
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      option: (optionValue) =>
        t(`option.${String(optionValue)}` as TranslationKey),
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside LanguageProvider");
  return context;
}

export function useLocalizedTitle(key: TranslationKey) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = t(key);
  }, [key, t]);
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={`language-switcher ${className}`.trim()}
      role="group"
      aria-label={t("language.label")}
    >
      {LOCALES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={locale === candidate ? "selected" : ""}
          aria-pressed={locale === candidate}
          aria-label={t(`language.${candidate}` as TranslationKey)}
          title={t(`language.${candidate}` as TranslationKey)}
          onClick={() => setLocale(candidate)}
        >
          {candidate === "bg" ? "БГ" : candidate.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
