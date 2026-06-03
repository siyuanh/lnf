# LNF — Product Requirements (English)

**Status:** Draft — derived from the brainstorming session on 2026-06-03. Pending stakeholder review.

## 1. Purpose

LNF is a service that helps return lost vulnerable persons (children, people with autism or intellectual disability, adults with dementia) to their caregivers. A caregiver registers the protected person in a mobile app and prints durable QR labels onto their clothing. If the person is found wandering or disoriented, any stranger can scan the QR with a phone camera, open a public web page, and report the location. The caregiver is notified through the channels they have chosen (push, email, SMS, and voice call), with the protected person's identity and the caregiver's contact details kept private.

## 2. Goals

1. Get the caregiver an actionable alert as fast as possible after a stranger scans a QR.
2. Let any finder report a location with **no app install, no account, and minimal typing**.
3. Keep the protected person's name, photo, and medical details private by default.
4. Keep the caregiver's contact information hidden from the finder; coordination flows one way (caregiver → finder).
5. Run as a small, maintainable system that a solo developer or small team can operate.

## 3. Non-goals (v1)

- Asset / object recovery (wallets, bags, keys). May be added in a later phase using the same tag model.
- In-system chat between caregiver and finder.
- WhatsApp as a notification channel. Likely Phase 2.
- Real-time "caregiver is on the way" presence signal.
- Pre-printed physical tag fulfillment (caregivers print their own QRs in v1).
- Multi-region launch. Initial launch is LATAM only.

## 4. Users and roles

| Role | Description | Authenticated? |
|---|---|---|
| **Caregiver** | A guardian, parent, family member, or care professional who registers protected persons and receives alerts. | Yes |
| **Protected person** | The vulnerable individual whose clothing carries the QR. Not a system user. | n/a |
| **Finder** | A stranger who scans the QR after encountering the protected person. | No |
| **Operator** (internal) | Project staff who monitor delivery, abuse, costs. Out of scope for product UI in v1; uses dashboards / DB. | n/a |

## 5. Functional requirements

### 5.1 Caregiver onboarding

- A caregiver MAY register and add their first protected person without creating a full account (anonymous-first, device-bound).
- A caregiver MUST be prompted to create a real account (email + password, with optional Google / Apple sign-in) before any notification channel can be activated, because account loss = notification loss.
- A caregiver MUST be able to manage multiple protected persons under one account.
- Each protected person MAY have multiple QR tags (multiple garments).

### 5.2 Tag generation and printing

- The caregiver generates a unique QR code per garment from inside the app.
- The QR encodes a URL of the form `https://<domain>/f/<opaque-code>`. The code MUST be unguessable.
- The app MUST provide a printer-friendly view sized for iron-on or fabric-label printing.
- The caregiver MUST be able to revoke a tag (e.g., garment discarded). Revoked tags show the finder a generic "this tag is no longer active" page and do not notify anyone.

### 5.3 Finder flow

- Scanning the QR with any modern phone camera MUST open the finder page directly in the browser. No app install, no login, no captcha by default (rate-limit instead).
- The finder page MUST display:
  - A short, friendly framing in the country's primary language (Spanish or Portuguese), explaining that this person may need help getting home.
  - An optional caregiver-written note (free text, ≤200 chars).
  - A form to submit the location and an optional message.
- The location field MUST accept either:
  - The phone's GPS coordinates (with explicit permission prompt), OR
  - A typed address / landmark.
- The finder MAY optionally provide a contact channel (phone or email) so the caregiver can reach them, but it is not required.
- After submission, the page MUST show a confirmation that the caregiver has been alerted.

### 5.4 Notification and escalation

- The caregiver MUST be able to configure, per protected person, which of {push, email, SMS, voice call} are enabled and in what order.
- All four channels MUST be available at launch.
- When a find is reported, the system MUST attempt the configured channels in order, with a configurable delay between attempts, and stop the moment the caregiver acknowledges the alert.
- The acknowledgement action MUST be available from any channel (e.g., a tap on the push, a link in the email, an "ack code" reply to SMS, a keypress during the voice call).
- If all configured channels fail to elicit acknowledgement within a defined window, the system MUST log the failure and surface it to the caregiver next time they open the app.

### 5.5 Privacy

- The finder MUST NOT see the protected person's name, photo, or medical details by default. (Per-tag opt-in to display extra info is a Phase 2 nice-to-have, not v1.)
- The finder MUST NOT see the caregiver's contact information at any time.
- The caregiver, after acknowledging, MUST be shown the find report (location, optional finder contact, timestamp) and MAY choose to contact the finder directly.
- All personal data MUST be processed in compliance with Brazil's LGPD as the strictest regional baseline; consent flows MUST be explicit and revocable. Data subjects (caregivers) MUST be able to export and delete their data.

### 5.6 Caregiver alert handling

- The caregiver MUST be able to view a history of finds per protected person.
- The caregiver MUST be able to mark a find as resolved (person recovered) or false-positive (e.g., test scan, malicious scan).
- A false-positive mark MUST temporarily rate-limit further finds against the same tag from the same finder fingerprint.

### 5.7 Internationalization

- All caregiver-facing UI MUST be available in Spanish (es) and Portuguese (pt-BR) at launch.
- The public finder page MUST be served in the language indicated by `Accept-Language`, defaulting to Spanish.
- English MAY be available as a third option but is not required for launch.

## 6. Non-functional requirements

- **Latency:** From "finder taps Submit" to "first notification dispatched" SHOULD be under 5 seconds in the median case.
- **Availability:** The finder page MUST remain reachable even when the mobile app backend is degraded; a static fallback that captures the report for later processing is acceptable.
- **Cost control:** SMS and voice calls cost real money per delivery. The system MUST enforce a per-account daily spend cap; the operator MUST be able to view per-country send costs.
- **Abuse resistance:** A single device MUST NOT be able to submit more than a small number of finds per minute against any tag; repeated abuse MUST be detectable in logs.
- **Data residency:** Personal data SHOULD be stored in a LATAM region where feasible.

## 7. Use cases

### UC-1: Caregiver registers a protected person and prints tags

1. Caregiver opens the mobile app for the first time.
2. App offers to add a protected person without creating an account (anonymous mode).
3. Caregiver enters: protected person's nickname (private), optional caregiver-written public note (e.g., "I have autism, please call my mother"), preferred notification channels.
4. App prompts caregiver to create a real account and verify their email / phone before activating SMS or voice channels.
5. Caregiver generates a QR for the first garment and prints it.
6. Caregiver attaches the QR (iron-on or sewn label) to the garment.

**Success:** The protected person now has at least one active garment with a QR linked to a configured caregiver alert chain.

### UC-2: A stranger finds the protected person and reports a location

1. The protected person is encountered by a stranger (the finder) in a park.
2. The finder notices the QR on the garment and scans it with their phone camera.
3. The phone opens the finder page in the browser (no install, no login).
4. The finder reads the framing message and the caregiver's public note.
5. The finder taps "Use my current location" (granting GPS permission) and adds a short message ("she is sitting on a bench by the fountain").
6. The finder optionally provides their phone number, then taps Submit.
7. The page confirms that the caregiver has been alerted.

**Success:** A find record is created and the escalation chain begins within seconds.

### UC-3: The caregiver receives and acknowledges an alert

1. The caregiver's chosen first channel (push) fires immediately.
2. The caregiver taps the push, which opens the app to the find report.
3. The caregiver sees: location (map pin or typed address), the finder's optional message, the finder's optional contact, the time of report.
4. The caregiver taps Acknowledge. The escalation chain stops.
5. The caregiver, if needed, taps the finder's phone number to call them directly.
6. After recovering the person, the caregiver marks the find as Resolved.

**Success:** Caregiver received the alert, contacted the finder, recovered the protected person, and the system has a clean audit record.

### UC-4: The caregiver does not respond to push or email

1. Push fires. After the configured delay (e.g., 2 minutes) with no acknowledgement, email is sent.
2. Email is sent. After the configured delay (e.g., 5 minutes) with no acknowledgement, SMS is sent.
3. SMS is sent. After the configured delay (e.g., 5 minutes) with no acknowledgement, a voice call is placed; the call plays a TTS message and asks the caregiver to press a key to acknowledge.
4. If the caregiver acknowledges via the voice call, the chain stops.
5. If no acknowledgement comes through any channel within the total window, the system records the failure and shows it the next time the caregiver opens the app.

**Success:** Best effort was made through every configured channel, the caregiver eventually learns of the find, and the failure is auditable.

### UC-5: The caregiver retires a garment

1. The caregiver opens the app, navigates to the protected person's tags.
2. The caregiver selects the worn-out garment's tag and taps Revoke.
3. From this point on, scans of that QR show a "this tag is no longer active" page and trigger no alerts.

**Success:** No further notifications are generated for the retired tag.

## 8. Open questions

- Exact escalation delays (push → email → SMS → voice). Default proposal: 2 / 5 / 5 minutes; operator-configurable.
- Acknowledgement-via-SMS UX (reply with code vs. tap a link). Recommend link tap; reply-handling adds Twilio inbound complexity.
- Default daily spend cap per account. Needs a country-by-country pricing table before a number is set.
- Whether to ship a caregiver-facing web app at launch, or mobile-only with a thin "manage your account" web view.
