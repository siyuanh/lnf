# LNF — Product Requirements (English)

**Status:** Draft — derived from the brainstorming session on 2026-06-03. Pending stakeholder review.

## 1. Purpose

LNF is a service that helps return lost vulnerable persons (children, people with autism or intellectual disability, adults with dementia) to their caregivers. Apparel partners manufacture clothing and accessories that carry pre-printed, unique, unguessable QR codes minted by LNF. A caregiver buys such a garment, scans the QR with the LNF mobile app, and activates the tag against a protected person they manage. If the person is later found wandering or disoriented, any stranger can scan the same QR with their phone camera, open a public web page, and report the location. The caregiver is notified through the channels they have chosen (push, email, SMS, and voice call), with the protected person's identity and the caregiver's contact details kept private. The finder may also opt in to share their live location continuously so the caregiver can track and reach them, while remaining anonymous.

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
- LNF-manufactured garments. LNF mints codes and provides a partner platform; physical manufacturing is done by partners.
- Partner-branded finder pages and partner-customized themes. Phase 2.
- Self-service partner signup. v1 onboards partners by invitation; the portal supports login but not signup.
- Multi-region launch. Initial launch is LATAM only.

## 4. Users and roles

| Role | Description | Authenticated? |
|---|---|---|
| **Caregiver** | A guardian, parent, family member, or care professional who activates tags, registers protected persons, and receives alerts. | Yes |
| **Protected person** | The vulnerable individual whose clothing carries the QR. Not a system user. | n/a |
| **Finder** | A stranger who scans the QR after encountering the protected person. | No |
| **Partner** | An apparel brand or retailer that mints batches of QR codes via LNF's API or partner portal and prints them onto its products before sale. | Yes |
| **Operator** (internal) | LNF staff who monitor delivery, abuse, costs, partner onboarding. Out of scope for product UI in v1; uses dashboards / DB. | n/a |

## 5. Functional requirements

### 5.1 Caregiver onboarding

- A caregiver MAY register and add their first protected person without creating a full account (anonymous-first, device-bound).
- A caregiver MUST be prompted to create a real account (email + password, with optional Google / Apple sign-in) before any notification channel can be activated, because account loss = notification loss.
- A caregiver MUST be able to manage multiple protected persons under one account.
- Each protected person MAY have multiple QR tags (multiple garments).

### 5.2 Tag minting (partner)

- A partner MUST be able to mint a batch of QR codes via either the partner portal (browser UI) or a programmatic API.
- Each minted code MUST be unguessable (CSPRNG-derived) and unique across the entire system.
- A minted code is created in the **`unactivated`** state. It exists in our database but is not yet linked to any caregiver or protected person.
- After minting, the partner MUST receive a downloadable artifact (CSV or equivalent) containing every code in the batch, suitable for ingest into a printing or labeling pipeline.
- The download artifact MUST be accessible only via a signed, expiring link tied to the requesting partner; the link MUST NOT be guessable.
- LNF MUST track per-partner totals: codes minted, codes activated, codes revoked, finds reported per code.
- v1 ships an invite-only partner onboarding model. Self-service partner signup is out of scope.

### 5.3 Tag activation (caregiver)

- The QR encodes a URL of the form `https://<domain>/f/<opaque-code>`. Both caregivers and finders scan the same URL; the system decides what to render based on the tag's state and on whether the visitor has the LNF mobile app installed.
- When a caregiver scans a QR with the LNF mobile app installed, the device's universal link / Android App Link MUST route the URL into the app instead of the browser.
- When the app receives an `unactivated` code, it MUST guide the authenticated caregiver through activation: choose an existing protected person or create a new one, label the garment (e.g., "blue jacket"), and confirm.
- When the app receives an `active` code that already belongs to the same caregiver, it MUST display informational details (which protected person, which garment, when activated) and offer revoke / relabel actions. It MUST NOT create a find.
- When the app receives an `active` code that belongs to a different caregiver, it MUST treat the scan as a finder action and present the finder flow (see §5.4).
- When a finder without the app scans the QR (browser fallback) and the code is `unactivated`, the page MUST display "This tag is new. Install the LNF app to activate it." with store links. No find is created.
- When a finder without the app scans the QR and the code is `revoked`, the page MUST display a generic "This tag is no longer active" message and create no find.
- The caregiver MUST be able to revoke a tag at any time (e.g., garment discarded, sold). Revoked tags follow the rule above.
- A successful activation MUST emit an audit event and bind the tag's `partner_id` (set at minting) to the now-known `caregiver_id` for partner analytics.

### 5.4 Finder flow

- Scanning the QR with any modern phone camera MUST open the finder page directly in the browser when the LNF app is not installed (or when the scanner is not the tag's caregiver). No app install, no login, no captcha by default (rate-limit instead). When the LNF app is installed, see §5.3 for routing rules.
- The finder page MUST display:
  - A short, friendly framing in the country's primary language (Spanish or Portuguese), explaining that this person may need help getting home.
  - An optional caregiver-written note (free text, ≤200 chars).
  - A form to submit the location and an optional message.
- The location field MUST accept either:
  - The phone's GPS coordinates (with explicit permission prompt), OR
  - A typed address / landmark.
- The finder MAY optionally provide a contact channel (phone or email) so the caregiver can reach them, but it is not required.
- After submission, the page MUST show a confirmation that the caregiver has been alerted.
- The page MUST offer the finder the option to share their live location continuously until the caregiver arrives (see §5.8).

### 5.5 Notification and escalation

- The caregiver MUST be able to configure, per protected person, which of {push, email, SMS, voice call} are enabled and in what order.
- All four channels MUST be available at launch.
- When a find is reported, the system MUST attempt the configured channels in order, with a configurable delay between attempts, and stop the moment the caregiver acknowledges the alert.
- The acknowledgement action MUST be available from any channel (e.g., a tap on the push, a link in the email, an "ack code" reply to SMS, a keypress during the voice call).
- If all configured channels fail to elicit acknowledgement within a defined window, the system MUST log the failure and surface it to the caregiver next time they open the app.

### 5.6 Privacy

- The finder MUST NOT see the protected person's name, photo, or medical details by default. (Per-tag opt-in to display extra info is a Phase 2 nice-to-have, not v1.)
- The finder MUST NOT see the caregiver's contact information at any time.
- The caregiver, after acknowledging, MUST be shown the find report (location, optional finder contact, timestamp) and MAY choose to contact the finder directly.
- All personal data MUST be processed in compliance with Brazil's LGPD as the strictest regional baseline; consent flows MUST be explicit and revocable. Data subjects (caregivers) MUST be able to export and delete their data.

### 5.7 Caregiver alert handling

- The caregiver MUST be able to view a history of finds per protected person.
- The caregiver MUST be able to mark a find as resolved (person recovered) or false-positive (e.g., test scan, malicious scan).
- A false-positive mark MUST temporarily rate-limit further finds against the same tag from the same finder fingerprint.

### 5.8 Live location sharing (finder → caregiver)

- After submitting the initial find, the finder MUST be offered a one-tap option on the same web page to share their live location continuously. The option is opt-in; the find is already actionable without it.
- While sharing, the browser MUST stream GPS coordinates (with timestamp and accuracy) to the backend at a reasonable interval (target: every 5–15 seconds), using a background-tolerant mechanism (e.g., the Geolocation API's `watchPosition` plus a Service Worker / `keepalive` POST so brief tab-backgrounding does not drop the stream).
- The caregiver app MUST render the live position on a map view (Google Maps embed or equivalent) with the latest pin and a brief trail of recent points; updates SHOULD appear in near-real-time (≤10 s end-to-end latency).
- Sharing MUST stop automatically when any of the following occurs: the finder taps "Stop sharing", the finder closes the page or kills the browser, the caregiver marks the find Resolved, or a hard cap (default: 60 minutes) elapses.
- The finder MUST be able to see, on their own page, an indicator that location is currently being shared and a clear control to stop it at any time.
- The finder's identity remains private to the caregiver. The caregiver sees only: the live pin, the trail, the timestamp of last update, and (if the finder chose to share it earlier) the optional contact.
- The caregiver MUST NOT be able to message or initiate contact with the finder *through the live-tracking surface*; the existing one-way model holds (caregiver may still phone/email the finder using the optional contact provided in §5.3).
- Live coordinates MUST be retained only as long as needed for the active find plus a short audit window (default: 24 hours after the find is Resolved or expired), then deleted, in keeping with §5.5 / LGPD data minimization.
- The finder MUST be shown a clear, plain-language consent prompt before the first GPS sample is sent, explaining what is shared, with whom, for how long, and how to stop.

### 5.9 Internationalization

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

### UC-0: A partner mints a batch of QR codes

1. A partner brand signs in to the partner portal (or calls the LNF API directly).
2. The partner requests a batch of `N` QR codes for an upcoming product run, optionally labeling the batch (e.g., "AW26 jacket run").
3. LNF generates `N` unique unguessable codes and creates them in the `unactivated` state, attributed to the partner.
4. The partner downloads a signed CSV of the codes via a single-use, expiring URL.
5. The partner imports the CSV into its printing or labeling pipeline; codes are printed onto garments before sale.

**Success:** A new batch of `unactivated` codes exists in the system, the partner has the CSV needed to print them, and analytics for that batch start at zero.

### UC-1: Caregiver activates a purchased tag

1. Caregiver buys a garment with a pre-printed QR from a partner.
2. Caregiver opens the LNF mobile app (creating an account if it is their first time, or signing in if returning) and scans the QR with the in-app camera, or scans with the phone camera; the universal link routes to the LNF app.
3. The app calls the backend with the code; the backend reports the tag is `unactivated` and belongs to a partner batch.
4. The app guides the caregiver to either select an existing protected person or add a new one (private nickname, optional public note, preferred notification channels). Email and/or phone are verified before SMS or voice channels are enabled.
5. The caregiver labels the garment (e.g., "blue jacket") and confirms.
6. The backend marks the tag `active`, links it to the protected person, and emits an audit event.

**Success:** The tag is now bound to a configured caregiver alert chain. Subsequent scans by strangers will create finds; subsequent scans by the same caregiver will show informational details.

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

### UC-5: The finder shares live location while waiting for the caregiver

1. The finder has just submitted the initial find report (UC-2).
2. The confirmation page offers "Share my live location with the caregiver until they arrive" with a clear plain-language explanation.
3. The finder taps the option and grants the browser's GPS permission (a separate prompt from the one in UC-2 if the browser requires re-consent for continuous access).
4. The page begins streaming GPS samples to the backend; an indicator on the page shows "Sharing live location" with a Stop button.
5. The caregiver, having acknowledged the alert (UC-3), opens the find detail and sees a live map with a pin moving in near-real-time, plus the time of the last update.
6. The caregiver navigates to the location. When they arrive (or the finder leaves), the finder taps Stop, or the caregiver marks the find Resolved, or the 60-minute cap elapses.
7. Live sharing ends; the trail is retained for the audit window (24 h after Resolved) and then deleted.

**Success:** The caregiver could follow the finder/protected person's position in real time without ever seeing the finder's identity, and tracking ended cleanly through any of the four stop conditions.

### UC-6: The caregiver retires a garment

1. The caregiver opens the app, navigates to the protected person's tags.
2. The caregiver selects the worn-out garment's tag and taps Revoke.
3. From this point on, scans of that QR show a "this tag is no longer active" page and trigger no alerts.

**Success:** No further notifications are generated for the retired tag.

## 8. Open questions

- Exact escalation delays (push → email → SMS → voice). Default proposal: 2 / 5 / 5 minutes; operator-configurable.
- Acknowledgement-via-SMS UX (reply with code vs. tap a link). Recommend link tap; reply-handling adds Twilio inbound complexity.
- Default daily spend cap per account. Needs a country-by-country pricing table before a number is set.
- Whether to ship a caregiver-facing web app at launch, or mobile-only with a thin "manage your account" web view.
- Whether to use Google Maps Platform for the caregiver's live-tracking view (familiar UX, costs per map load + per direction request) or a free alternative (MapLibre + OpenStreetMap tiles, slightly less polished but no per-load fee). Decision affects cost model.
- Browser support for backgrounded continuous geolocation varies (especially on iOS Safari, which throttles aggressively when the tab is not foreground). The page must handle gracefully when the finder's browser drops the stream — define the UX (e.g., "Tap to resume sharing").
- Partner billing model: per-code-minted, per-activated-tag, per-find, monthly fee, or a hybrid? Affects whether a billing/subscription module is needed in v1.
- Partner code-CSV download policy: single-use only (most secure), N-times within a window (more forgiving), or partner-callable anytime (most convenient, weakest)? Default proposal: single-use with 7-day re-issue on partner request.
- Partner-branded finder pages and per-partner theming (logo, support contact). Out of scope for v1, but the data model should leave room — track this when designing the `partner` table.
