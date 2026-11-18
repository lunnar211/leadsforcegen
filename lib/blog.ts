// Blog content for LeadsForceGen. Every guide is written fresh for this
// site — original, practical advice for finding and contacting real
// businesses. No content is copied from anywhere.

export type Block = { h: string } | { p: string } | { list: string[] };

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO date, shown on the page
  body: Block[];
};

function words(body: Block[]): number {
  return body
    .map((b) => ("p" in b ? b.p : "h" in b ? b.h : b.list.join(" ")))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function readingMinutes(post: Post): number {
  return Math.max(3, Math.round(words(post.body) / 200));
}

export const posts: Post[] = [
  {
    slug: "how-to-find-business-leads-without-buying-a-list",
    title: "How to Find Business Leads Without Buying a List",
    description:
      "Bought lead lists are usually stale, incomplete and expensive. Here is how to build a fresh list of real businesses yourself, from public sources, in an afternoon.",
    date: "2026-11-18",
    body: [
      {
        p: "A bought lead list feels like a shortcut, but it rarely is. Lists sold in bulk are often months old, full of closed businesses, and shared with every other buyer. The businesses on them have already been emailed by dozens of sellers. Building your own list from public sources takes a little more time — but the leads are fresher, they fit your market exactly, and nobody else has the same list.",
      },
      { h: "Start with what businesses publish themselves" },
      {
        p: "Every business that wants customers leaves a trail: a website, a maps listing, a directory entry, opening hours, a phone number. That is public information, published by the business itself so customers can find it. A good lead is simply a business whose public details match what you sell. Start by writing down exactly who you want: which industry, which city, and what size of business. A narrow definition — “independent dental clinics in Dubai” rather than “healthcare” — makes every later step easier.",
      },
      { h: "Use maps and open business data" },
      {
        p: "Maps are the most complete public record of local businesses. Open datasets such as Overture Maps and OpenStreetMap list millions of businesses with their name, category, address and often a website or phone number. Search them by city and category, and you get a real list of businesses that exist in that place right now. Cross-check a few names against their websites and you will quickly see which entries are current.",
      },
      { h: "Filter for contact details, not just names" },
      {
        p: "A list of business names is not a lead list. A lead needs a way to reach the business: a phone number, an email address, or at minimum a website with a contact page. When you build your list, keep only the businesses that publish at least one contact channel, and note which one it is. A list of 50 businesses you can actually contact beats a list of 5,000 names you cannot.",
      },
      { h: "Verify before you reach out" },
      {
        p: "Before you email or call, spend thirty seconds checking the business is still trading. Open its website: is it live and current? Check its maps listing: are the hours and phone number the same? A business that closed six months ago wastes your time and hurts your sender reputation if you email a dead address. Verification is the difference between a lead list and a guessing list.",
      },
      { h: "Keep the list fresh" },
      {
        p: "Businesses open, close, move and change numbers every month. A list built in January is noticeably stale by June. Re-check your list every few months, remove the dead entries, and add the new businesses that opened since. A small, fresh list that you maintain will always outperform a big, old one you bought once.",
      },
      {
        list: [
          "Define your target narrowly: one industry, one city, one business size.",
          "Build from public listings and the businesses' own websites.",
          "Keep only businesses with a real contact channel.",
          "Verify each business is still trading before you reach out.",
          "Refresh the list every few months.",
        ],
      },
      {
        p: "If you want to skip the manual work, LeadsForceGen does exactly this for you: search by industry and city and get verified businesses with phone, email, website and source, ready to export. Your first 30 leads a day are free.",
      },
    ],
  },
  {
    slug: "how-to-write-a-cold-email-that-gets-replies",
    title: "How to Write a Cold Email That Gets Replies",
    description:
      "Most cold emails fail in the first two lines. A short, specific, honest email that is clearly about the reader — not about you — is the one that gets answered.",
    date: "2026-11-18",
    body: [
      {
        p: "Business owners receive cold emails every day, and most of them are deleted in seconds. The ones that get replies are not clever or pushy. They are short, specific, and clearly written for one person. If you can write an email that looks like it was written for this business and no other, you are already ahead of almost everyone else in their inbox.",
      },
      { h: "The subject line: short, specific, honest" },
      {
        p: "Your subject line has one job: to get the email opened. Keep it under about seven words, make it about the reader's business, and never use clickbait. “Quick question about your clinic's bookings” works better than “Increase your revenue by 300%!!!” — the first sounds like a real person, the second sounds like spam. Never use “Re:” unless you are actually replying to something.",
      },
      { h: "The first sentence is about them, not you" },
      {
        p: "Open with something true about their business: a service they offer, a recent change, a detail from their website. “I noticed your clinic added evening appointments this month” proves you looked. “We are a leading provider of...” proves you copied and pasted. The reader decides in the first sentence whether the rest is worth reading, so spend it on them.",
      },
      { h: "One email, one ask" },
      {
        p: "Ask for exactly one thing, and make it small: a five-minute call, a reply with a yes or no, a look at one page. An email that asks for a call, a demo, a quote and a meeting in the same message asks for nothing, because the reader cannot tell what you want. A small, clear ask is easy to say yes to.",
      },
      { h: "Keep it short" },
      {
        p: "Aim for under 125 words — roughly five short paragraphs at most. Every sentence must earn its place. Cut your company history, your full service list and your mission statement; none of it belongs in a first email. If the reader is interested, they will ask for more. Short emails also read well on a phone, which is where most business owners read them.",
      },
      { h: "Personalise one detail per email" },
      {
        p: "You do not need to write every email from scratch, but you do need one real detail per business: their city, their specialty, something from their website. A template with one personalised line outperforms a fully personal email that never gets sent, and it outperforms a generic blast every time. Prepare the template, then spend one minute per business filling in the detail.",
      },
      { h: "What not to do" },
      {
        list: [
          "No attachments on a first email — they trigger spam filters.",
          "No ALL CAPS, no excessive exclamation marks, no fake urgency.",
          "No misleading subject lines or pretending you have met before.",
          "No long paragraphs of features. Benefits in one line, then the ask.",
          "No email without an easy way to opt out.",
        ],
      },
      {
        p: "Write the email, read it aloud once, and delete the weakest sentence. Then send it — and follow up once if you hear nothing, because busy people miss good emails too. LeadsForceGen's AI outreach can draft the first version for you from the lead's real details, so the personalisation is already there.",
      },
    ],
  },
  {
    slug: "how-to-check-if-a-business-email-is-real",
    title: "How to Check If a Business Email Is Real",
    description:
      "Guessing email addresses burns your sender reputation. Here are the simple checks — domain, mail records, patterns and bounces — that tell you whether an address is real before you send.",
    date: "2026-11-18",
    body: [
      {
        p: "An email address that looks right can still be dead: the person left, the business closed, or the address never existed. Sending to dead addresses gets your emails bounced, and too many bounces tells mail providers you are a spammer. A few simple checks before you send will save your reputation and your time.",
      },
      { h: "Start with the domain" },
      {
        p: "A real business email lives on the business's own domain — the same domain as its website. If a dental clinic's website is brightsmile-dubai.com, an address like info@brightsmile-dubai.com is plausible; the same name at a free mailbox is not the business's published address. Open the website first. Many businesses print their email on their contact page, which settles the question immediately.",
      },
      { h: "Check the domain's mail records" },
      {
        p: "Every domain that receives email publishes MX records — the entries that tell the internet where its mail goes. Free online tools can look these up in seconds: type the domain, and if there are no MX records, the domain cannot receive mail at all. This one check catches a large share of bad addresses, and it costs nothing.",
      },
      { h: "Learn the common patterns — but never guess blindly" },
      {
        p: "Most businesses use one of a few patterns: firstname@, firstname.lastname@, info@, contact@ or hello@. If you know a person's name and the domain, the pattern is often guessable — but a guess is still a guess. Send your first message to a guessed address only after the domain passes the MX check, and watch for a bounce. Better still, use a lead source that publishes the address the business itself listed.",
      },
      { h: "Read the bounce" },
      {
        p: "If an email bounces, read the reason instead of ignoring it. A “mailbox does not exist” bounce means the address is dead — remove it and never mail it again. A “mailbox full” bounce means the address exists but is not monitored. A spam-block bounce means your sending setup, not the address, is the problem. Treating every bounce the same way wastes good addresses and keeps bad ones.",
      },
      { h: "Use a verification tool for big lists" },
      {
        p: "Checking one address by hand is easy; checking five hundred is not. Email verification tools check MX records, syntax and mailbox existence in bulk, and return a simple verdict per address: valid, risky or invalid. Mail only the valid ones. The cost of verification is far less than the cost of a damaged sender reputation, which can take weeks to repair.",
      },
      {
        list: [
          "The address should be on the business's own domain.",
          "The domain must have MX records — no MX, no mail.",
          "Never mail a guessed address without checking the domain first.",
          "Remove hard-bounced addresses immediately.",
          "Verify in bulk before any large campaign.",
        ],
      },
      {
        p: "LeadsForceGen checks the email domain of every lead for valid mail records and shows you the source of each address, so you start from published addresses instead of guesses. Verify the business before you write — it takes seconds and protects everything else you do.",
      },
    ],
  },
];

posts.push(
  {
    slug: "how-to-build-a-prospect-list-for-your-city",
    title: "How to Build a Prospect List for Your City and Industry",
    description:
      "A prospect list is only useful if it matches your market. Define your ideal customer, pick your sources, set your columns, and start with fifty good names — not five thousand random ones.",
    date: "2026-11-18",
    body: [
      {
        p: "A prospect list is a working document, not a trophy. Its value is not how many names it holds, but how many of them are the right businesses, in the right place, with a way to reach them. Building one well takes an afternoon of focused work — and it is the foundation of every sale you will make from it.",
      },
      { h: "Define your ideal customer first" },
      {
        p: "Before you collect a single name, write down your ideal customer in one sentence: the industry, the size, and the place. “Independent restaurants in Kathmandu with 10–50 seats” is a definition you can build a list from. “Businesses in Nepal” is not. The narrower your definition, the better your list — and the easier your outreach, because every message can speak to the same kind of business.",
      },
      { h: "Pick two or three sources, not ten" },
      {
        p: "Maps and open business data are the backbone: they list businesses by city and category with addresses and often a website or phone. Add one local source — a chamber of commerce directory, a trade association list, or a local business directory — for the names maps miss. Two or three sources that you actually check beat ten sources you never open.",
      },
      { h: "Set your columns before you start" },
      {
        p: "Decide what each row must contain before you collect anything. A useful minimum is: business name, category, city, phone, email, website, address, and a notes field for what you learned about them. If a business has no phone and no email, it is not yet a prospect — note the website and move on. Keeping the same columns for every row makes the list usable later, for mail merges, call lists and follow-ups.",
      },
      { h: "Score the list, then start small" },
      {
        p: "Not every prospect is equal. Rank each row by how reachable it is: phone and email present scores highest, website only scores lower, nothing scores zero. Then start with the top fifty. Fifty good prospects, contacted properly, will teach you more about your market than five thousand names ever will — and you can grow the list from what you learn.",
      },
      { h: "Keep it alive" },
      {
        p: "A prospect list rots. Businesses close, move, change numbers and change owners. Set a simple routine: every month, remove the dead entries, add the new businesses that opened, and update the ones that changed. Note the date you last checked each row. A list with a last-checked date is a tool; a list without one is a guess.",
      },
      {
        list: [
          "One sentence defines your ideal customer.",
          "Two or three sources are enough — maps plus one local directory.",
          "Same columns for every row: name, category, city, phone, email, website, address, notes.",
          "Start with the fifty most reachable prospects.",
          "Review and refresh the list every month.",
        ],
      },
      {
        p: "LeadsForceGen builds this kind of list in minutes: pick your industry and city, and export businesses with phone, email, website and source already filled in. Start free with 30 leads a day, and grow the list from the replies you get.",
      },
    ],
  },
  {
    slug: "email-deliverability-basics-for-outreach",
    title: "Email Deliverability Basics for Outreach",
    description:
      "Deliverability is whether your email reaches the inbox at all. Sender reputation, authentication, list quality and sending pace decide it — here is each one in plain words.",
    date: "2026-11-18",
    body: [
      {
        p: "You can write the best cold email in the world and still get zero replies — if it lands in spam. Deliverability is the share of your emails that reach the inbox, and it is decided before the reader ever sees your subject line. The good news is that it depends on a handful of things you control.",
      },
      { h: "Your sender reputation is everything" },
      {
        p: "Mail providers keep a reputation score for every sending domain and address, built from your history: how many of your emails bounce, how many are marked as spam, and how many are opened and replied to. A good reputation gets you delivered; a bad one gets you filtered. Reputation is earned slowly and lost quickly, so protect it like a credit score.",
      },
      { h: "Authentication: SPF, DKIM and DMARC in plain words" },
      {
        p: "These three records prove your emails really come from your domain. SPF lists which servers may send mail for your domain. DKIM adds a digital signature to each email. DMARC tells receivers what to do when a message fails those checks. Setting all three up takes an hour with your domain provider, and without them a large share of your mail will be treated as suspicious. If you send outreach from your own domain, this is the single most important technical step.",
      },
      { h: "Warm up slowly" },
      {
        p: "A brand-new domain that sends five hundred emails on day one looks like a spammer, because that is what spammers do. Start with a small daily volume — twenty or thirty a day — and increase gradually over two to three weeks. Send to people who are likely to reply, because replies and opens build reputation. Patience in the first month pays for itself for a year.",
      },
      { h: "Clean your list, every time" },
      {
        p: "Every hard bounce damages your reputation, so never mail a list you have not checked. Remove bounced addresses immediately and never mail them again. Remove people who asked to be removed — instantly, without argument. A smaller, cleaner list always delivers better than a big, dirty one.",
      },
      { h: "Write like a person, not a flyer" },
      {
        p: "Spam filters notice patterns: ALL CAPS subject lines, too many links, too many images, words like “free money” and “guaranteed”. Write plain text or near-plain emails, keep links to one or two, and say what you mean in normal words. And always include a simple opt-out line — it is required by law in most places, and it keeps complaints down, which protects your reputation.",
      },
      {
        list: [
          "Set up SPF, DKIM and DMARC before you send anything at volume.",
          "Start small and increase sending gradually over weeks.",
          "Remove bounces and opt-outs immediately, every time.",
          "Keep emails plain, short, and honest.",
          "Measure inbox placement and replies — not just how many you sent.",
        ],
      },
      {
        p: "LeadsForceGen helps on the list side: every lead's email domain is checked for valid mail records before you see it, so you start from addresses that can receive mail. Good data is the cheapest deliverability fix there is.",
      },
    ],
  },
  {
    slug: "how-to-follow-up-without-spamming",
    title: "How to Follow Up Without Spamming",
    description:
      "Most replies come after the first email, not from it. A short, useful follow-up at the right time — and knowing when to stop — is what turns silence into meetings.",
    date: "2026-11-18",
    body: [
      {
        p: "The first email is rarely the one that gets the reply. Business owners are busy: they see your message, mean to answer, and forget. A follow-up is not pestering — it is a reminder. The difference between a good follow-up and spam is simple: a good one adds something new, arrives at a sensible time, and stops when the answer is no.",
      },
      { h: "Wait two to three business days" },
      {
        p: "Give the first email a chance to be seen. Two to three business days is the right gap for the first follow-up — long enough that you are not hovering, short enough that they still remember the first message. If you follow up the same day, you look desperate; if you wait a month, you are a stranger again.",
      },
      { h: "Add value every time" },
      {
        p: "Never write “just checking in” or “just bumping this to the top of your inbox”. Each follow-up should add one new thing: a relevant example, a useful observation about their business, a shorter version of your ask, or a different time to talk. If you have nothing new to say, you have nothing to send — wait until you do.",
      },
      { h: "Three follow-ups is a good rule" },
      {
        p: "One first email plus up to three follow-ups is a sensible limit for cold outreach. Most replies arrive within those three. After that, the return on another email is tiny and the risk of annoyance grows. If you have sent three useful follow-ups and heard nothing, the answer is no for now — move on and try again in a few months with something genuinely new.",
      },
      { h: "The break-up email" },
      {
        p: "Your last follow-up can be a graceful close: “I have not heard back, so I will stop here — if this becomes relevant later, just reply and I will pick it up.” This email gets more replies than any other follow-up, because it removes pressure. Some people reply to say not now, some to say yes — and either answer is useful.",
      },
      { h: "Always make opting out easy" },
      {
        p: "Every email you send should include a simple way to opt out, and you must honour it immediately. One click, no login, no reply required. It is the law in most countries, it keeps complaints down, and it protects your sender reputation. A list that respects opt-outs stays deliverable; a list that does not gets filtered.",
      },
      {
        list: [
          "First follow-up after 2–3 business days, then about a week apart.",
          "Every follow-up adds one new, useful thing.",
          "Three follow-ups, then stop — or send one graceful break-up email.",
          "Never follow up on the same day as the first email.",
          "Opt-out in every email, honoured immediately.",
        ],
      },
      {
        p: "A good lead list makes follow-ups easier, because each business is real and reachable — and because you know what to write about them. Start with verified leads, write one useful follow-up, and let the break-up email do the rest.",
      },
    ],
  },
  {
    slug: "what-makes-a-good-lead-list",
    title: "What Makes a Good Lead List?",
    description:
      "A good lead list is accurate, complete, recent, well-matched and honest about its sources. Here is how to judge any list — bought or built — before you trust it with your time and reputation.",
    date: "2026-11-18",
    body: [
      {
        p: "Every seller claims their lead list is the best. Few lists are. Whether you buy one, build one, or get one from a tool, the same five tests decide whether it is worth your time: accuracy, completeness, recency, fit and honesty about where it came from.",
      },
      { h: "1. Accuracy over size" },
      {
        p: "A list of 500 correct businesses beats a list of 50,000 names that are half wrong. Accuracy means the business exists, the name is spelled right, and the contact details belong to it. Before you trust a list, check ten entries by hand: open the websites, check the phone numbers. If more than one or two of the ten are wrong, the list is not accurate — and the rest will waste your time in the same proportion.",
      },
      { h: "2. Completeness: a way to reach each business" },
      {
        p: "A name without a contact channel is not a lead. Every row should have at least one working way to reach the business — a phone number, an email address, or a website with a contact page. Ideally it has two. Lists that are mostly names and cities are not prospect lists; they are directories.",
      },
      { h: "3. Recency: how old is it?" },
      {
        p: "Business data goes stale fast. A list built last year will contain closed businesses, moved businesses and changed numbers. Ask when the data was collected and how it is refreshed. A good list is maintained continuously, not compiled once and sold forever. If the seller cannot tell you the age of the data, assume it is old.",
      },
      { h: "4. Fit: the right businesses, not just any businesses" },
      {
        p: "A list only works if it matches your market. Ten thousand restaurants are useless if you sell to dentists. Check the list against your ideal customer: the right industry, the right size, the right place. A smaller list that fits perfectly will always outperform a huge list that mostly does not.",
      },
      { h: "5. Honest about its sources" },
      {
        p: "A trustworthy list tells you where each entry came from: a public listing, the business's own website, an open dataset. If the source is hidden, you cannot verify anything — and you cannot know whether the data was collected legally and respectfully. Transparency is not a nice extra; it is how you know the list is real.",
      },
      {
        list: [
          "Test ten entries by hand before trusting a list.",
          "Every row needs at least one real contact channel.",
          "Ask when the data was collected and how it is refreshed.",
          "Fit matters more than size.",
          "Every lead should show its source.",
        ],
      },
      {
        p: "LeadsForceGen is built on these five tests: over 1.1 million businesses from Overture Maps, OpenStreetMap and the businesses' own websites, with the source shown on every lead and email domains checked for valid mail records. Try it free — 30 leads a day — and judge the list by its first ten entries.",
      },
    ],
  },
);

posts.push(
  {
    slug: "how-small-businesses-use-lead-data-to-grow",
    title: "How Small Businesses Use Lead Data to Grow",
    description:
      "You do not need a sales team to grow with lead data. Local businesses use it to find new customers, win back old ones and build partnerships — starting with one city and one industry.",
    date: "2026-11-18",
    body: [
      {
        p: "Lead data sounds like something only big companies use. In practice, small businesses get the most from it, because they know their market personally and can act on a short list immediately. A café supplier, a cleaning company or a dental clinic does not need ten thousand leads. It needs fifty right ones — and the discipline to contact them well.",
      },
      { h: "Finding new local customers" },
      {
        p: "The simplest use is the most direct: find the businesses in your area that could buy from you, and introduce yourself. A supplier of restaurant equipment lists the restaurants that opened recently in its city. A commercial cleaning firm lists offices and clinics by neighbourhood. The list is the market, and the market is local, which means your message can be specific: you know their area, their trade, and what they need.",
      },
      { h: "Winning back old enquiries" },
      {
        p: "Most small businesses sit on a pile of old enquiries they never followed up: quotes requested, calls missed, emails unanswered. Lead data helps you re-check those businesses — are they still trading, who is the right contact now, has anything changed? A polite re-introduction to a business that already showed interest converts far better than a cold call to a stranger.",
      },
      { h: "Partnerships and referrals" },
      {
        p: "Lead data is not only for selling. A wedding photographer can list event venues for referrals. A bookkeeper can list new companies that will need accounts done. A web designer can list businesses whose websites are out of date. Partnerships built from a good list cost nothing and compound: one venue that recommends you is worth a hundred cold emails.",
      },
      { h: "Start small and measure" },
      {
        p: "Pick one city and one industry, and build a list of fifty. Contact them over two weeks, note what happens, and measure three numbers: how many replied, how many turned into a conversation, and how many became customers. Those three numbers tell you whether your list and your message work. If they do, grow the list. If they do not, change the message before you buy a bigger list — a bigger list will not fix a weak message.",
      },
      { h: "Mistakes to avoid" },
      {
        list: [
          "Buying a huge list before you know your message works.",
          "Emailing everyone at once instead of in small, careful batches.",
          "Contacting businesses that are closed or the wrong size.",
          "Forgetting to follow up — the reply usually comes after the first email.",
          "Ignoring opt-outs. One complaint costs more than ten ignored emails.",
        ],
      },
      {
        p: "Lead data rewards small businesses that are specific and consistent. Start with fifty real businesses in your area, contact them properly, and measure what happens. LeadsForceGen gives you those fifty for free — 30 leads a day, no card needed.",
      },
    ],
  },
  {
    slug: "data-removal-and-privacy-basics-for-lead-generation",
    title: "Data Removal and Privacy Basics for Lead Generation",
    description:
      "Lead generation only works if it respects the businesses it lists. Public business data, personal data, opt-outs, GDPR and CAN-SPAM — explained in plain words.",
    date: "2026-11-18",
    body: [
      {
        p: "Lead generation has a simple rule at its heart: you may use what a business publishes about itself, and you must respect it when a business asks you to stop. Everything else — the laws, the tools, the best practice — follows from that. Here is what it means in practice.",
      },
      { h: "Public business data is not personal data" },
      {
        p: "A business's published phone number, email address, website and opening hours are business information. The business put them there so customers can reach it. That is fundamentally different from a private person's personal phone number or home address, which is never a lead. Responsible lead generation uses only the first kind and never collects the second.",
      },
      { h: "The right to be removed" },
      {
        p: "Even when data is public, a business can ask not to be listed. That request must be honoured quickly and completely: removed from search results, removed from exports, and never added back. On LeadsForceGen, any business can remove itself in seconds on the remove-a-business page, with no account and no email needed — and the removal applies to all future results, not just one search.",
      },
      { h: "GDPR and CAN-SPAM in plain words" },
      {
        p: "Two sets of rules matter most. Under the GDPR, you must have a lawful reason to process business contact data — legitimate interest in a business-to-business context — and you must respect objections and removal requests. Under CAN-SPAM and similar laws, every marketing email must identify who you are, give a real postal address, and include a working opt-out that you honour promptly. These are not formalities: regulators and mail providers both enforce them, and ignoring them is how senders get blocked.",
      },
      { h: "What responsible outreach looks like" },
      {
        p: "Responsible outreach is easy to recognise: you mail a real business at its published address, about something relevant to it, once or twice, with an easy opt-out — and you stop when asked. Irresponsible outreach is the opposite: scraped personal addresses, irrelevant blasts, no opt-out, and repeated mail after a refusal. The first kind builds a business. The second kind gets domains blocked and accounts closed.",
      },
      { h: "What to do if a business asks to be removed" },
      {
        list: [
          "Remove it immediately — do not argue, delay or ask why.",
          "Remove it everywhere: your list, your tool, your future exports.",
          "Confirm the removal if the business asks for confirmation.",
          "Check how it got on your list, and fix the source if needed.",
          "Never re-add a business that asked to be removed.",
        ],
      },
      {
        p: "Trust is the whole business of lead generation. A list that respects removals stays accurate, stays deliverable and stays legal. If you run a business and want to be removed from LeadsForceGen, use the remove-a-business page or email us — it takes seconds, and it is permanent.",
      },
    ],
  },
  {
    slug: "how-to-verify-a-business-before-you-call-or-email",
    title: "How to Verify a Business Before You Call or Email",
    description:
      "Two minutes of checking saves a wasted call, a bounced email and a damaged reputation. A simple checklist: website, listing, phone, email — and the signs a business has closed.",
    date: "2026-11-18",
    body: [
      {
        p: "Every call to a closed business and every email to a dead address costs you twice: the time you spent, and a small dent in your reputation with phone networks and mail providers. Two minutes of verification before you reach out prevents most of it. Here is the checklist.",
      },
      { h: "Check the website first" },
      {
        p: "Open the business's website. Is it live? Does it look current — recent news, current opening hours, this year's copyright date? A website that loads but has not been updated in three years is a warning sign. A website that does not load at all is a stronger one. Either way, do not treat the business as live until its website says it is.",
      },
      { h: "Cross-check the listing" },
      {
        p: "Compare the maps listing with the website: same phone number, same address, same hours? If they disagree, trust the website and note the discrepancy. Check the reviews too — recent reviews mean recent customers, which is the best evidence a business is trading. A business with no reviews in two years deserves a second look before you call.",
      },
      { h: "Verify the phone and the email" },
      {
        p: "For the phone, a quick search of the number can confirm it belongs to the business and is still in use. For the email, check that the domain has valid mail records — a domain that cannot receive mail will bounce your message. If you are working through a list, verify in bulk before the campaign, not one by one while you are sending.",
      },
      { h: "Signs a business has closed" },
      {
        list: [
          "Website down, or replaced by a domain-for-sale page.",
          "Phone number disconnected or answered by a different business.",
          "Maps listing marked permanently closed, or no recent reviews.",
          "Social profiles silent for a year or more.",
          "The address now shows a different business on maps.",
        ],
      },
      { h: "Why verification matters" },
      {
        p: "Verification is not busywork. Calls to dead numbers waste your call time and mark your number as a nuisance caller. Emails to dead addresses bounce, and bounces damage your sender reputation, which affects every email you send afterwards. And calling the wrong business by mistake is embarrassing in a way that is hard to undo. Two minutes per business, or a verified list, avoids all three.",
      },
      {
        p: "LeadsForceGen does the first pass for you: every lead comes from licensed public listings and the business's own website, with the source shown, and email domains are checked for valid mail records. You still get the final say — a quick look at the website before you call is always worth it.",
      },
    ],
  },
);

export function postBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
