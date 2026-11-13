import { pool, db } from "./client.js";
import { dictationClips, lessons, speakingPhrases, words } from "./schema.js";
import type { NewDictationClip, NewLesson, NewSpeakingPhrase, NewWord } from "./schema.js";

const wordSeed: NewWord[] = [
  {
    slug: "reluctant",
    term: "reluctant",
    pos: "adjective",
    ipa: "/rɪˈlʌktənt/",
    meaning: "not willing to do something; hesitant",
    example: "She was reluctant to admit that she had made a mistake.",
    synonyms: "unwilling, hesitant, disinclined",
    level: "B1"
  },
  {
    slug: "anticipate",
    term: "anticipate",
    pos: "verb",
    ipa: "/ænˈtɪsɪpeɪt/",
    meaning: "to expect something and prepare for it",
    example: "We anticipate that prices will rise next year.",
    synonyms: "expect, foresee, predict",
    level: "B1"
  },
  {
    slug: "thorough",
    term: "thorough",
    pos: "adjective",
    ipa: "/ˈθʌrə/",
    meaning: "complete and careful, with attention to detail",
    example: "The doctor did a thorough examination.",
    synonyms: "detailed, meticulous, exhaustive",
    level: "B1"
  },
  {
    slug: "resilient",
    term: "resilient",
    pos: "adjective",
    ipa: "/rɪˈzɪliənt/",
    meaning: "able to recover quickly from difficulty",
    example: "Children are often more resilient than adults expect.",
    synonyms: "tough, adaptable, hardy",
    level: "B2"
  },
  {
    slug: "inevitable",
    term: "inevitable",
    pos: "adjective",
    ipa: "/ɪnˈevɪtəbl/",
    meaning: "certain to happen and impossible to avoid",
    example: "With so little practice, mistakes were inevitable.",
    synonyms: "unavoidable, certain, inescapable",
    level: "B2"
  },
  {
    slug: "comprehensive",
    term: "comprehensive",
    pos: "adjective",
    ipa: "/ˌkɒmprɪˈhensɪv/",
    meaning: "including everything necessary; complete",
    example: "The report gives a comprehensive overview of the market.",
    synonyms: "complete, extensive, full",
    level: "B2"
  },
  {
    slug: "subtle",
    term: "subtle",
    pos: "adjective",
    ipa: "/ˈsʌtl/",
    meaning: "not obvious; delicate and hard to notice",
    example: "There is a subtle difference between the two words.",
    synonyms: "slight, delicate, understated",
    level: "B2"
  },
  {
    slug: "tedious",
    term: "tedious",
    pos: "adjective",
    ipa: "/ˈtiːdiəs/",
    meaning: "boring because it lasts too long",
    example: "Copying the data by hand was a tedious task.",
    synonyms: "boring, dull, monotonous",
    level: "B2"
  },
  {
    slug: "compelling",
    term: "compelling",
    pos: "adjective",
    ipa: "/kəmˈpelɪŋ/",
    meaning: "so interesting that it holds your attention",
    example: "She made a compelling argument for change.",
    synonyms: "convincing, gripping, persuasive",
    level: "B2"
  },
  {
    slug: "feasible",
    term: "feasible",
    pos: "adjective",
    ipa: "/ˈfiːzəbl/",
    meaning: "possible to do successfully",
    example: "It is not feasible to finish the project by Friday.",
    synonyms: "possible, practical, viable",
    level: "B2"
  },
  {
    slug: "ambiguous",
    term: "ambiguous",
    pos: "adjective",
    ipa: "/æmˈbɪɡjuəs/",
    meaning: "having more than one possible meaning",
    example: "His email was ambiguous, so I had to ask what he meant.",
    synonyms: "unclear, equivocal, vague",
    level: "B2"
  },
  {
    slug: "alleviate",
    term: "alleviate",
    pos: "verb",
    ipa: "/əˈliːvieɪt/",
    meaning: "to make pain or a problem less severe",
    example: "A short break can alleviate stress during exams.",
    synonyms: "ease, relieve, reduce",
    level: "B2"
  }
];

const lessonSeed: NewLesson[] = [
  {
    slug: "present-perfect-vs-past-simple",
    title: "Present perfect vs past simple",
    level: "B1",
    summary:
      "Know when a finished past action needs past simple and when a life experience needs present perfect.",
    content: {
      sections: [
        {
          heading: "The core difference",
          body: [
            "Past simple is for a finished action at a finished time: \"I saw him yesterday.\" The time is closed.",
            "Present perfect connects the past to now: \"I have seen this film.\" We do not say when — the result or experience matters now.",
            "If you mention a finished time expression (yesterday, last year, in 2019, two hours ago), use past simple."
          ]
        },
        {
          heading: "Signals that help",
          body: [
            "Present perfect loves: already, yet, just, ever, never, since, for, so far, recently, this week.",
            "Past simple loves: yesterday, ago, last night, in 2020, when I was a child."
          ]
        }
      ],
      examples: [
        "I have lived in Berlin for three years. (I still live there.)",
        "I lived in Berlin for three years. (I do not live there now.)",
        "Have you ever tried sushi? — Yes, I tried it last summer."
      ],
      mistakes: [
        {
          wrong: "I have seen him yesterday.",
          right: "I saw him yesterday.",
          note: "Finished time → past simple."
        },
        {
          wrong: "I am living here since 2019.",
          right: "I have been living here since 2019.",
          note: "Use present perfect continuous for an action continuing to now."
        }
      ],
      quiz: [
        {
          type: "mcq",
          prompt: "We ___ to Rome in 2019.",
          options: ["have gone", "went", "have been going", "go"],
          answer: 1,
          explanation: "2019 is a finished time, so use past simple."
        },
        {
          type: "mcq",
          prompt: "I ___ my keys, so I can't get in.",
          options: ["lost", "have lost", "was losing", "had lost"],
          answer: 1,
          explanation: "The result matters now (I can't get in), so present perfect."
        },
        {
          type: "fill",
          prompt: "Complete with the correct form of 'see': Have you ever ___ that film?",
          answers: ["seen"],
          explanation: "Present perfect uses the past participle: seen."
        },
        {
          type: "mcq",
          prompt: "Which sentence is correct?",
          options: [
            "I have met her last week.",
            "I met her last week.",
            "I have meet her last week.",
            "I did met her last week."
          ],
          answer: 1,
          explanation: "'Last week' is finished time, so past simple is required."
        }
      ]
    }
  },
  {
    slug: "conditionals-1-2-3",
    title: "Conditionals: 1st, 2nd and 3rd",
    level: "B2",
    summary:
      "Talk about real possibilities, imaginary situations and regrets with the right conditional form.",
    content: {
      sections: [
        {
          heading: "First conditional — real future",
          body: [
            "If + present simple, will + verb.",
            "Use it for a realistic future possibility: \"If it rains, we will stay inside.\""
          ]
        },
        {
          heading: "Second conditional — unreal present",
          body: [
            "If + past simple, would + verb.",
            "Use it for imaginary or unlikely situations: \"If I had more time, I would learn Japanese.\""
          ]
        },
        {
          heading: "Third conditional — unreal past",
          body: [
            "If + past perfect, would have + past participle.",
            "Use it for regrets about the past: \"If I had studied harder, I would have passed.\""
          ]
        }
      ],
      examples: [
        "If you practise daily, you will improve quickly.",
        "If I were you, I would apologise.",
        "If we had left earlier, we wouldn't have missed the train."
      ],
      mistakes: [
        {
          wrong: "If I will see him, I will tell him.",
          right: "If I see him, I will tell him.",
          note: "No 'will' in the if-clause."
        },
        {
          wrong: "If I would be rich, I would travel.",
          right: "If I were rich, I would travel.",
          note: "Second conditional uses past simple in the if-clause."
        }
      ],
      quiz: [
        {
          type: "mcq",
          prompt: "If it ___ tomorrow, we'll cancel the picnic.",
          options: ["will rain", "rains", "rained", "would rain"],
          answer: 1,
          explanation: "First conditional: if + present simple."
        },
        {
          type: "mcq",
          prompt: "If I ___ you, I would take the job.",
          options: ["am", "was", "were", "would be"],
          answer: 2,
          explanation: "Second conditional uses 'were' for all subjects."
        },
        {
          type: "fill",
          prompt: "Complete: If I had known, I ___ have called you. (one word)",
          answers: ["would"],
          explanation: "Third conditional result: would have + participle."
        },
        {
          type: "mcq",
          prompt: "Which sentence is NOT correct?",
          options: [
            "If you heat ice, it melts.",
            "If I had a car, I would drive you.",
            "If I would know the answer, I would tell you.",
            "If she calls, I will answer."
          ],
          answer: 2,
          explanation: "'Would' cannot appear in the if-clause."
        }
      ]
    }
  },
  {
    slug: "british-vs-american",
    title: "British vs American English",
    level: "B2",
    summary:
      "The vocabulary, spelling and everyday phrases that make you sound British rather than American.",
    content: {
      sections: [
        {
          heading: "Same thing, different word",
          body: [
            "In the UK you live in a flat, take the lift and walk on the pavement. In the US it is an apartment, an elevator and a sidewalk.",
            "Neither is wrong, but mixing them sounds odd. Pick British English and stay consistent."
          ]
        },
        {
          heading: "Spelling you can predict",
          body: [
            "British spelling often keeps the older French or Latin form: colour, favourite, centre, and organise with an s.",
            "American spelling is shorter: color, favorite, center, and organize with a z."
          ]
        },
        {
          heading: "Everyday phrases",
          body: [
            "British: 'Fancy a cuppa?' · 'It's a bit dear.' · 'Cheers' for thanks.",
            "American: 'Want some coffee?' · 'It's kind of expensive.' · 'Thanks.'"
          ]
        }
      ],
      examples: [
        "I've just moved into a lovely flat in Bristol. (UK)",
        "I just moved into a nice apartment in Boston. (US)",
        "The lift was out of order, so I walked up. (UK)"
      ],
      mistakes: [
        {
          wrong: "I bought a new apartment in Manchester.",
          right: "I bought a new flat in Manchester.",
          note: "British English uses 'flat' for a home."
        },
        {
          wrong: "My favorite color is blue.",
          right: "My favourite colour is blue.",
          note: "British spelling: favourite, colour."
        },
        {
          wrong: "Take the elevator to the second floor.",
          right: "Take the lift to the first floor.",
          note: "UK: lift. The floor above the ground floor is the 'first floor'."
        }
      ],
      quiz: [
        {
          type: "mcq",
          prompt: "In the UK, the machine that takes you up a building is a ___.",
          options: ["elevator", "lift", "escalator", "stairlift"],
          answer: 1,
          explanation: "British English uses 'lift'."
        },
        {
          type: "mcq",
          prompt: "Which spelling is British?",
          options: ["color", "center", "favourite", "organize"],
          answer: 2,
          explanation: "'Favourite' is the British spelling."
        },
        {
          type: "fill",
          prompt: "At university in London, I live in a ___ with two friends.",
          answers: ["flat"],
          explanation: "A 'flat' is a British apartment."
        },
        {
          type: "mcq",
          prompt: "You step off the bus onto the ___.",
          options: ["sidewalk", "pavement", "curb", "crosswalk"],
          answer: 1,
          explanation: "British English: 'pavement'."
        }
      ]
    }
  }
];

const speakingSeed: NewSpeakingPhrase[] = [
  {
    slug: "could-i-have-water",
    text: "Could I have a glass of water, please?",
    focus: "Polite requests and the schwa /ə/",
    tip: "Keep 'of' weak: /əv/. Let your voice fall gently on 'please'.",
    level: "B1"
  },
  {
    slug: "im-afraid-thursday",
    text: "I'm afraid I can't make it on Thursday.",
    focus: "Contractions and /θ/",
    tip: "Tongue tip between the teeth for 'Thursday' — not 'Fursday'.",
    level: "B1"
  },
  {
    slug: "weather-lovely",
    text: "The weather's been absolutely lovely this week.",
    focus: "/ʌ/ vs /ɒ/",
    tip: "'Lovely' is /ˈlʌvli/; 'weather' is /ˈweðə/ with a voiced 'th'.",
    level: "B2"
  },
  {
    slug: "rather-take-bus",
    text: "I'd rather take the bus than drive into town.",
    focus: "Connected speech",
    tip: "Link 'rather take' smoothly: /ˈrɑːðə teɪk/, with no gap.",
    level: "B2"
  },
  {
    slug: "flat-near-river",
    text: "She's got a lovely flat near the river.",
    focus: "British vocabulary",
    tip: "In the UK a home is a 'flat'. 'She's got' is the natural British form.",
    level: "B1"
  },
  {
    slug: "queued-cinema",
    text: "We queued for ages at the cinema.",
    focus: "/kjuː/ and /dʒ/",
    tip: "'Queue' sounds exactly like the letter Q: /kjuː/.",
    level: "B1"
  },
  {
    slug: "brilliant-idea",
    text: "Honestly, I think that's a brilliant idea.",
    focus: "Voiced /ð/ vs unvoiced /θ/",
    tip: "Buzz your voice on 'that's'; use just air on 'think'.",
    level: "B2"
  },
  {
    slug: "ring-you-all-week",
    text: "I've been meaning to ring you all week.",
    focus: "Weak forms",
    tip: "Reduce 'been' to /bɪn/ and keep the sentence moving.",
    level: "B2"
  },
  {
    slug: "kettle-on",
    text: "It's a bit chilly, put the kettle on.",
    focus: "/tʃ/ and British small talk",
    tip: "'Chilly' starts with /tʃ/, as in 'church'.",
    level: "B1"
  },
  {
    slug: "didnt-catch",
    text: "Sorry, I didn't quite catch that.",
    focus: "Polite intonation",
    tip: "Stress 'catch' and let your voice rise at the end to sound gentle.",
    level: "B1"
  }
];

const dictationSeed: NewDictationClip[] = [
  {
    slug: "train-edinburgh",
    text: "The train to Edinburgh leaves from platform nine.",
    hint: "A station announcement",
    level: "B1"
  },
  {
    slug: "kettle-biscuit",
    text: "I've put the kettle on, would you like a biscuit?",
    hint: "A very British offer",
    level: "B1"
  },
  {
    slug: "pub-half-six",
    text: "We're meeting at half past six in the pub.",
    hint: "Making plans with friends",
    level: "B1"
  },
  {
    slug: "flat-fridge",
    text: "The flat comes with a washing machine and a fridge.",
    hint: "A letting agent describes a home",
    level: "B2"
  },
  {
    slug: "pop-to-shop",
    text: "Could you pop to the shop for a pint of milk?",
    hint: "A quick favour at home",
    level: "B1"
  },
  {
    slug: "pouring-brolly",
    text: "It's pouring with rain, so bring your brolly.",
    hint: "British weather advice",
    level: "B2"
  },
  {
    slug: "ringing-about-advert",
    text: "I'm ringing about the advert for the flat.",
    hint: "A phone call about renting",
    level: "B2"
  },
  {
    slug: "queue-enormous",
    text: "The queue for the bus was absolutely enormous.",
    hint: "Small talk about the commute",
    level: "B2"
  }
];

async function main(): Promise<void> {
  console.log("→ seeding words");
  await db.insert(words).values(wordSeed).onConflictDoNothing({ target: words.slug });

  console.log("→ seeding lessons");
  await db.insert(lessons).values(lessonSeed).onConflictDoNothing({ target: lessons.slug });

  console.log("→ seeding speaking phrases");
  await db
    .insert(speakingPhrases)
    .values(speakingSeed)
    .onConflictDoNothing({ target: speakingPhrases.slug });

  console.log("→ seeding dictation clips");
  await db
    .insert(dictationClips)
    .values(dictationSeed)
    .onConflictDoNothing({ target: dictationClips.slug });

  console.log(
    `✓ done — ${wordSeed.length} words, ${lessonSeed.length} lessons, ${speakingSeed.length} speaking phrases, ${dictationSeed.length} dictation clips`
  );
  await pool.end();
}

main().catch(async (error: unknown) => {
  console.error("✗ seed failed:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
