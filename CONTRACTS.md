# Contracts

Two files. `contracts/recused.py` is the fund. `contracts/fixtures/countersigned.py`
is a second contract that pays against the fund's reading. Both pin the runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` in their first line.

Every method returns a JSON string. Amounts are decimal strings of atto.

## contracts/recused.py

### Purpose

A shared fund, organised in desks, where a spend is paid only after two members
other than its poster have countersigned it, and where a countersignature is
refused when the interests the signer filed before the spend existed are moved
by it under either branch of the decision. In version 2 members stake to sign,
the second clear reading starts a hold instead of paying, and during the hold
anyone may cite a page of a register the desk named in advance against either
counted signature; a page every validator reads as showing an undisclosed
relation to the payee strikes the signature and slashes the stake.

### Consensus

One nondeterministic block, in `approve`, per countersignature that reaches it,
and in version 2 one in `challenge` per challenge that passes every rule (see
"Version 2" below). This section is the reading round, unchanged.

| step | where | what happens |
|---|---|---|
| the documents | `_spend_document`, `_interests_document` | built by the contract from stored fields; every member-written part passes through `_quoted`, which fences it and keeps it on one line; every id, number and address is checked again where it is printed |
| the prompts | `_task(spend_doc, interests_doc, order)` | one instruction text; the two blocks and the two questions in `FIRST_ORDER`, then in `SECOND_ORDER`. For the second asking the document builders also print the member's entries and the identifications in the second order, each line under its own number |
| the second order | `_second_order(n)` | an even number of things reversed; an odd number reversed, rotated by one and its last two exchanged. No element keeps its position at any size from 2 to 6 |
| the askings | `leader_fn` inside `_reading_round` | two `gl.nondet.exec_prompt(prompt, response_format="json")` calls, inside the closure |
| the reading | `_read_word` | one of GAINS, LOSES, UNAFFECTED, UNCLEAR per branch becomes `G`, `L`, `U`, `?`; anything else is unreadable |
| the combination | `_combine` | same readable character in both orders is that character; an unreadable order gives `x`; two readable but different give `/` |
| the value | `{"v": two characters}` | position 1 is the branch where the spend is carried out, position 2 the branch where it is not |
| the comparison | `_agrees` | each validator reruns `leader_fn` inside `try/except` and compares the two characters by exact string equality; its own failure is a disagreement |
| a failed leader | `_handle_leader_error` | the validator reruns the work; an `[EXPECTED]` error agrees only on the identical message, a `[TRANSIENT]` one only with another `[TRANSIENT]` |
| the verdict | `_verdict` | `UU` clear; a `G` or an `L` in either position interested; anything else unclear |
| the sentence | `_why` | composed by the contract from closed phrases; nothing a model wrote is stored |

A round is a value only when both askings were answered. If either cannot be
made, the leader raises `[TRANSIENT]` for the whole round; when the validators
agree, `approve` stores a procedural refusal, the attempt is unspent and the
document is not sealed.

The three refusals that ask no model (`declared`, `late` and `standing`) write
the value `--`. The sanitiser `_clean_value` turns any round result that is not
two characters of `GLU?/x` into `xx`, so `-` can never come back from a judged
round.

### Runs

The spends posted to one payee address on one desk since the last one that was
paid are one run. `run_rows["D1:<payee>"]` holds its number, whether it is live,
its gate (the sequence number of its first posting), the number of that first
spend, and up to four identifications made in it.

- `post_spend` starts a run when none is live for that address, and otherwise
  joins the live one. The spend stores the run's number and its gate.
- `approve` and `identify` compare the member's `filed_seq` with the spend's
  `gate_seq`, never with its own `posted_seq`.
- The first judged reading of a member in a run that is not clear is kept in
  `standing_rows["D1:<payee>:<run>:<address>"]`. While it is there, `approve`
  refuses that member on every spend of that run with the verdict `standing`.
- The identifications held by the run are copied onto each later spend of it at
  posting, except one written by that spend's own poster.
- The payment of any spend of the live run, by `release` after its hold, ends
  the run. The next spend to that address starts another, with a new gate, nothing
  standing and nothing carried.

### State

```
Desk     opener, label, roster_json, pot, committed, drawn, funded_total (a decimal string),
         claims_open, claims_due, open_json, n_members, n_spends, n_open, n_paid, n_expired,
         n_readings, n_refusals, opened_at, opened_seq, fund_round, min_notice,
         v2: registries_json, member_stake, hold_minutes, staked, slashed_in, n_holding,
         n_challenges, n_hidden, n_cleared, n_unclear
Member   who, desk, number, statement, entries_json, addresses_json, n_entries, n_declared,
         filed_seq, filed_at, version, digest, open_posted,
         v2: public_name, stake, holds_open, signed_open, hidden, cleared, retired
Spend    desk, number, poster, payee, amount, description, digest, doc_digest, posted_seq,
         gate_seq, run, posted_at, notice_until, window_until, state, approvals, approver1,
         approver2, n_idents, shut_out, n_attempts, poster_tried, claimed, paid_at, expired_at,
         poster_declared, v2: held_at, hold_until, n_holds, n_struck, n_challenges

desk_rows      "D1"                          -> Desk
desk_count     desks are D1 .. D<desk_count>
member_rows    "D1:<address>"                -> Member
member_at      "D1:M3"                       -> "D1:<address>"
history_rows   "D1:<address>:2"              -> a superseded disclosure, as JSON
spend_rows     "D1:S4"                       -> Spend
spend_digests  "D1:<digest>"                 -> the latest spend with that content
run_rows       "D1:<payee>"                  -> the run of spends to that address, as JSON
standing_rows  "D1:<payee>:<run>:<address>"  -> the reading that stands for that member in that run
ident_rows     "D1:S4:2"                     -> an identification, as JSON
ident_by       "D1:S4:<address>"             -> that member's identification number, or "0" if turned away
ident_digests  "D1:S4:<digest>"              -> the identification number
reading_rows   "D1:S4:<address>"             -> a reading, as JSON; also the attempt key
reading_at     "D1:S4:1"                     -> the address of the first reading written, and so on
funded_rows    "D1:1:<address>"              -> credit units in round 1, as a decimal string
claim_rows     "D1:S4:<address>"             -> atto a funder who left has claimed on S4
claim_lists    "D1:<address>"                -> the open spends that funder holds a claim on
refusal_rows   "D1:3" or "open:3"            -> a procedural refusal, as JSON; rings of 12
refusal_count  the counter of the "open" ring
seq_count      the event counter
challenge_rows "D1:S4:2"                     -> a challenge that was read, as JSON (v2)
challenge_seen "D1:S4:<address>:<url hash>"  -> the challenge that read that page against that signature (v2)
bond_credit    "<address>"                   -> atto of bond credit, as a decimal string (v2)
bond_total, bounties_paid, bonds_to_members, n_challenges, n_hidden, n_cleared, n_unclear, n_released (v2)
```

A spend's `state` is `open`, `holding` (v2: two clear readings counted, the hold
running, the amount still committed), `paid` or `expired`.

The dataclasses hold scalars only. Nothing is ever deleted from any map. Ids are
assigned by the contract. Content is deduplicated by digest: a spend with the
same payee, amount and words as one that is open, an identification with the
same words as one on that spend, and an amendment that says what the disclosure
already says are each refused. A spend whose words differ is accepted and joins
the run of its payee address, which is what keeps it from being a fresh
question.

### Methods that write

| method | who | the sender check | on refusal |
|---|---|---|---|
| `open_desk(label, roster_csv, min_notice_minutes, registries_json, member_stake, hold_minutes)` payable | anyone | open by design; the sender is recorded as opener and funder; the roster, the minimum notice (5 to 1,440 minutes), 1 to 3 register prefixes, the member stake (0.1 to 100 GEN) and the hold (5 to 10,080 minutes) are fixed here for ever | returns `ok: false`, stores the refusal, returns the value sent |
| `fund(desk)` payable | anyone | open by design; the credit is written under the sender's address | returns `ok: false`, stores the refusal, returns the value sent |
| `enrol(desk, statement, entries_json, addresses_csv, public_name)` payable (v2) | an address on the roster, or anyone on an open desk | the row is keyed by the sender; a sender with a row is refused; a sender not on the roster is refused; the value must be exactly the desk's stake | returns `ok: false`, stores the refusal, returns the value sent |
| `restake(desk)` payable (v2) | the member | the row topped up is the sender's; exactly the amount missing; a retired member is refused | returns `ok: false`, returns the value sent |
| `retire(desk)` (v2) | the member | the row marked is the sender's; once | raises `[EXPECTED]` |
| `withdraw_stake(desk)` (v2) | a retired member | the stake is the sender's, paid to the sender, only while `holds_open` and `signed_open` are both 0 | raises `[EXPECTED]` |
| `amend(desk, statement, entries_json, addresses_csv)` | the member | the row rewritten is the one keyed by the sender; a sender with no row is refused | raises `[EXPECTED]` |
| `post_spend(desk, payee, amount, description, notice_minutes, window_minutes)` | a member | a sender with no row on the desk is refused; a sender with two open spends of their own is refused; the payee may not be the sender; `notice_minutes` may not be below the desk's minimum | raises `[EXPECTED]` |
| `identify(desk, spend, text)` | a member, not the spend's poster, whose disclosure predates the gate | a sender with no row is refused; the spend's poster is refused; a sender whose `filed_seq` is above the spend's `gate_seq` is refused; one per sender | raises `[EXPECTED]`, except when the four places are taken: then it returns `ok: false`, counts the sender on the spend as turned away, and the judged document says how many were |
| `approve(desk, spend)` | a member, not the poster, once | not enrolled, the poster, an earlier reading by the sender, the sender's own address as payee, a standing reading of the sender's: each refused | never raises; see below |
| `expire(desk, spend)` | anyone, after `window_until` | open by design; the caller chooses nothing | raises `[EXPECTED]` |
| `reclaim(desk)` | a funder | the units and the claims read are the sender's rows; the transfer goes to the sender | raises `[EXPECTED]` |
| `release(desk, spend)` (v2) | anyone, once the hold has ended | open by design; the caller chooses nothing | raises `[EXPECTED]`; a signature struck elsewhere in the run is dropped and answered `ok: false`, nothing paid |
| `deposit()` payable (v2) | anyone | open by design; the bond credit is written under the sender's address | returns `ok: false` when nothing is sent |
| `withdraw()` (v2) | anyone with bond credit | the credit read and the address paid are the sender's | raises `[EXPECTED]` |
| `challenge(desk, spend, member_no, url)` (v2) | anyone but the member challenged | the sender may not be the member whose signature is cited; the bond is the sender's credit | raises `[EXPECTED]` before any page is fetched; a failed read stores nothing |

`amend`, `post_spend`, `expire`, `reclaim`, `release`, `retire`,
`withdraw_stake`, `withdraw` and `challenge` raise because nothing is decided in
them before the round and no value arrives with them: a raise changes nothing
and the explorer shows the reason. `identify` raises for the same reason, except
for the one refusal that has to be remembered. `open_desk`, `fund`, `enrol`,
`restake` and `deposit` take value, so they never raise and never run a model.
`approve` decides, so it never raises.

No argument of a caller is copied into a stored row or a message unless it has
the shape the contract itself gives such a thing: a desk id, a spend number or
an address. Anything else is answered with fixed words.

### `approve`, in order

Procedural refusals decide nothing about the sender's reading and leave the
attempt unspent. Each is stored in a ring: the desk's own when the sender holds
a disclosure on that desk, the `open` ring otherwise. Final refusals write the
reading row, which is also the attempt key.

| # | condition | kind |
|---|---|---|
| 1 | no such desk | procedural, `open` ring |
| 2 | no such spend | procedural |
| 3 | the sender is not enrolled on that desk | procedural, `open` ring |
| 4 | the sender posted the spend | procedural, and counted on the spend as `poster_tried` |
| 5 | the spend is paid or expired | procedural |
| | no readable clock on the transaction | procedural |
| 6 | the window has closed; the answer names `expire` | procedural |
| 7 | the notice window has not closed | procedural |
| 8 | the sender already has a reading on this spend | procedural |
| | the sender has retired from countersigning (v2) | procedural, no model |
| | the sender's stake is not whole (v2) | procedural, no model; `restake` tops it up |
| 9 | the payee is the sender's own address or one they declared | final, `declared`, value `--`, no model |
| 10 | the sender's `filed_seq` is above the spend's `gate_seq` | final, `late`, value `--`, no model |
| 11 | the sender's earlier reading in this run was not clear | final, `standing`, value `--`, no model; the row names the earlier spend, its value and its verdict |
| 12 | the spend already counts two (unreachable: the second clear reading latches it holding) | procedural |
| 13 | the judged document's digest differs from the sealed one (unreachable: no identification is taken once the notice window has closed or anybody has been read) | procedural |
| | the nodes agreed that a model could not be reached | procedural; nothing is sealed |
| | the round returned a value that is not `UU` | final, `interested` or `unclear`; the document is sealed; the reading stands for the run |
| | the round returned `UU` | counted; the document is sealed; the second one starts the hold |

On the second clear reading (v2): the second approver is recorded, the state is
set to `holding`, `held_at` and `hold_until` (now plus the desk's hold) are
written, and both signers' `holds_open` go up by one. Nothing is paid and the
amount stays committed. A counted reading also raises its member's
`signed_open` until the spend ends or the reading is struck.

`release`, once `hold_until` has passed, first looks up the standing row of both
counted members in the spend's run (`_drop_struck`, two lookups). A member struck
by a register page on another spend of the run has that signature marked struck
by the run and dropped, with no slash: the hold ends for both signers, the spend
goes back to `open` (or `expired`, past its window), and `release` answers
`{"ok": false, "dropped": [...]}` with nothing paid. The second clear reading
makes the same check before it latches a hold, so a dropped first signature
makes the new reading the first. Otherwise, in this order: the state is set to
`paid`, the pot, the commitment, the drawn total, the claims of funders who left
and the counters are updated, both signers' counts come down, the run of the
payee address is ended, and then the transfer to the payee is emitted. This is
what the second clear reading did in version 1.

### Money

Credit is counted in units. `fund` gives `value * units outstanding // backing`
units, where the backing is the pot less what funders who left have claimed on
open spends and less what is owed to them on expired ones; while nothing has
been drawn that is one unit per atto.

`reclaim` pays the sender `free * units // units outstanding`, where the free
balance is the pot less what is committed and less what is owed on expired
spends, and takes all of the sender's units. For each open spend it writes a
claim of `(amount - already claimed) * units // units outstanding` under the
sender's address. A spend that is paid voids the claims on it. A spend that
expires moves them into `claims_due`, which is left out of the free balance and
paid to each holder by their next `reclaim`. A funder who has left holds no
units, so further calls take nothing from the free balance. A spend in its hold
counts as open for all of this.

Version 2 adds two kinds of money, neither of them in the pot. **Stakes**: each
member's is held on the row and summed in `staked`; `enrol` and `restake` take
exactly what the desk asks, `withdraw_stake` returns it to a retired member with
nothing counted, and a hidden finding slashes it whole, `stake // 2` paid to the
challenger in that transaction and the rest added to the pot (and to
`slashed_in`); when the desk has no units outstanding (`funded_total` is 0) the
whole stake goes to the challenger, because a half in the pot would belong to
whoever funded next, with one atto. **Bond credit**: `deposit` adds to the
sender's, `withdraw` returns all of it, and a challenge that is read stakes
`CHALLENGE_BOND` (0.05 GEN) of it: kept by the challenger on hidden, unclear and
repeat, paid to the member on clean. At
every step the contract holds exactly the sum over desks of `pot + staked`, plus
`bond_total`; the seeded journeys in the tests check that after every call.

### Methods that read

| view | arguments | returns |
|---|---|---|
| `desk(desk)` | `"D1"` | label, opener, roster, pot, committed, claims_open, claims_due, free, drawn, funded_total, the counters, the open spends, fund_round, min_notice_minutes, the clock |
| `desks()` | | the 20 most recently opened desks, with the count and the first id shown; a page, not a directory |
| `desks_from(start)` | `"1"` | 20 desks from that number onwards |
| `member(desk, addr)` | | the whole disclosure, each relation with the contract's phrase for it, the sequence number, the version, the digest, and how many open spends the member has posted |
| `members(desk)` | | every member's number, address, sequence number, version and counts |
| `spend(desk, n)` | `"D1"`, `"4"` | every field of the spend, both counted approvers and the value each stored; with `gate_seq`, `run`, `shut_out`, `poster_tried` and `claimed` |
| `spends(desk)` | | the 20 most recent spends of the desk |
| `run(desk, payee)` | `"D1"`, an address | the run of that payee address: its number, whether it is live, its gate, its first spend, and the identifications it holds |
| `reading(desk, n, addr)` | | one stored reading: value, verdict, the contract's sentence, the document digest, the sequence numbers, the gate and the run; a standing one also names the earlier spend |
| `readings(desk, n)` | | every reading on the spend, in the order written, and `poster_tried` |
| `document(desk, n)` | | the spend document as the first asking reads it, its sha256, the sealed digest, the same lines as the second asking reads them, and which window is open |
| `idents(desk, n)` | | every identification with its author, the spend it was first made on if it was carried, and how many members were turned away |
| `refusals(desk)` | `"D1"` or `"open"` | that ring of procedural refusals |
| `credit(desk, addr)` | | that funder's units, their claims on open and expired spends, the free balance, and what `reclaim` would pay now |
| `challenges_of(desk, n, offset, limit)` (v2) | `"D1"`, `"4"`, `"0"`, `"20"` | at most 20 challenges read on the spend, oldest first: the page address, the member, the challenger, the finding, the fingerprint, and the money each moved |
| `bond_credit_of(addr)` (v2) | an address | that address's bond credit and how many challenges it covers |
| `stats()` (v2) | | the register's counts: desks, challenges, hidden, cleared, unclear, releases, bond credit held, bounties paid, bonds paid to members |
| `rule()` | | the agreement rule, the tables, the limits and what is never agreed, in words; in v2 also the register round, its two questions word for word, its combine rule and its money table |

Every view takes ids, numbers and addresses, never a document, because a read
call on Studio fails once the whole encoded call crosses 256 bytes.

### Limits written into the code

| what | value |
|---|---|
| statement | 24 to 600 characters |
| entries | 1 to 6; name 3 to 80; detail up to 160; `other` needs a detail of at least 12 |
| declared addresses | up to 6 |
| description | 16 to 400 characters |
| identification | 8 to 200 characters; up to 4 per spend, one per member, never the poster |
| desk name | 4 to 60 characters |
| roster | empty, or 3 to 20 addresses |
| members of an open desk | up to 20 |
| members before a spend may be posted | 3 |
| open spends | 8 per desk, 2 per poster |
| notice window | the desk's minimum (5 to 1,440 minutes, fixed at opening) to 1,440 minutes |
| whole window | the notice window plus at least 10 minutes, at most 20,160 minutes |
| funder credit | at most 10^600 units per desk, kept as a decimal string |
| every text | printable ASCII on one line, with no `<`, no `>` and no double quote |
| public name (v2) | 3 to 60 characters, at least one letter |
| registers (v2) | 1 to 3 https prefixes ending in `/`, each at most 120 characters, the JSON at most 420 |
| member stake (v2) | 0.1 to 100 GEN, fixed at opening |
| hold (v2) | 5 to 10,080 minutes, fixed at opening |
| cited page (v2) | https, at most 200 characters, below one of the desk's registers; each address read once against each signature on each spend, and a page text already read against it settles nothing |
| challenge bond (v2) | 0.05 GEN of bond credit |
| page as judged (v2) | the first 32,000 characters, spacing collapsed, at most 8,000; fingerprint 16 hex |
| every list a view returns | at most 20 rows |

A text over its cap is refused. Nothing judged is ever shortened or sampled; a
prompt with every text at its cap is 10,151 characters.

### Version 2: the hold and the register round

| step | where | what happens |
|---|---|---|
| the rules, before any fetch | `challenge` | the spend is `holding` and its hold has not ended; `member_no` names one of the two counted signers; the sender is not that member; the address passes `_url_problem` (https, at most 200 characters, a lowercase host, letters, digits and `- . _ ~ /`, no empty or dot segment) and `_under` one of the desk's register prefixes; the page has not been read against that signature on that spend; the sender holds `CHALLENGE_BOND` of bond credit; the spend document still has the sealed digest. Each failure raises `[EXPECTED]` |
| the documents | `_spend_document_of`, `_disclosure_at_signing` | the spend document the readings sealed, and the member's disclosure as it stood when they countersigned (from `history_rows` if they have amended since) |
| the fetch | `leader_fn` inside `_register_round` | `gl.nondet.web.get(url).status` first: 400 or above, or a failed fetch, raises `[TRANSIENT]`; then `gl.nondet.web.render(url, mode="text")` |
| the page | `_page_text`, `_fingerprint` | the raw text cut to 32,000 characters, its spacing collapsed, capped at 8,000; nothing left is `[TRANSIENT]`; the fingerprint is the first 16 hex characters of its sha256 |
| the prompts | `_register_task`, `_tagged_block`, `_register_question` | the SPEND, INTERESTS and PAGE blocks, each fenced and tagged with the start of its own sha256; the public name printed by `_quoted` inside the question |
| the askings | `REGISTER_ASKINGS` | SHOWS with the page first, SHOWS with the documents first, SILENT with the page first, SILENT with the documents first; a model failure raises `[LLM_ERROR]` |
| the finding | `_read_answer`, `_combine_register` | yes, no or unclear per asking; hidden only for yes, yes, no, no; clean only for no, no, yes, yes; anything else unclear. SILENT is yes only for a page that gives the member's public name, so a page that never names the member is unclear |
| the value | `{"verdict": ..., "fp": ...}` | compared by `_agrees_on_page` by exact equality; a leader error is never agreed with; a validator whose own rerun fails disagrees |
| the repeat check | `_settle_challenge` | the fingerprint is keyed against the signature (`D1:S4:<addr>:fp:<fp>`): a page text already read against it on this spend, under any address, is recorded with verdict `repeat` (and `read_as`, `repeat_of`) and settles nothing |
| the settlement | `_settle_challenge`, `_strike` | O(1), latches before transfers: the challenge row and both once-only keys; hidden strikes, ends the hold, reopens or expires the spend, slashes, pays the bounty (the whole stake when no funder holds credit); clean pays the bond to the member; unclear and repeat change nothing |
| the run | `_struck_in_run`, `_drop_struck` | a strike's standing row is read by `release` and by the second clear reading on every other spend of the run, which drop that member's signature, O(1) and without a slash |

A failed read writes nothing at all, so the same challenge can be made again.

## contracts/fixtures/countersigned.py

### Purpose

A deposit that is released to a payee only against a spend that a desk of one
named Recused contract paid on two clear readings that no register page struck.
It shows the reading being consumed by a contract that did not make it. No model
runs in it.

### State

```
register    the Recused address, fixed at deployment
n_rows      deposits are "1" .. "<n_rows>"
rows        "1"                  -> a deposit, as JSON
live        "D1:S2:<address>"    -> the id of that depositor's live deposit on that spend, or "0"
```

### Methods

| method | who | the sender check | effect |
|---|---|---|---|
| deployment, `Countersigned(register)` | anyone | | reads `desks()` on the address given and fails unless it answers as a register does, so nobody can send value to a copy that could never settle |
| `deposit(desk, spend, payee, doc_digest)` payable | anyone | the row and the live key are written under the sender's address; a sender with a live deposit on that spend is refused | holds the value against one spend, bound to the payee and to the digest of the judged document; a refusal returns the value |
| `release(deposit_id)` | anyone | open by design; the caller chooses nothing | reads `spend(desk, n)` on the register and settles, as below |
| `cancel(deposit_id)` | the depositor | the sender must be the address on the row | returns the deposit while the bound spend does not exist |
| `held(deposit_id)` view | | | one deposit |
| `terms()` view | | | the register, how many deposits there have been, the ids of the 20 most recent, and what the contract pays against |

`release`:

| the register says | outcome |
|---|---|
| no such spend | raises; the depositor may cancel |
| `open`, or `holding` (v2) | raises "call again later"; nothing changes |
| `expired` | the deposit goes back to the depositor, state `returned` |
| `paid`, but another payee, another document digest, a count that is not two, a counted reading the register does not report as unstruck, or a counted reading that is not `UU` | the deposit goes back to the depositor, state `refused`, with the reason |
| `paid`, the bound payee, the bound digest, two counted readings both `UU` and neither struck | the deposit is paid to the bound payee, state `released` |
| any other word | raises; nothing is settled on a state the contract cannot read |

Every outcome is latched on the row before the transfer is emitted.

### Why it binds to an address and a digest

A desk id is not authority. Ids are handed out in order, and whoever opens the
next desk gets the next id. So the register address is fixed when the fixture
is deployed, and the depositor names the payee and the digest of the document
they read. A spend that was paid to somebody else, or judged on a different
document, returns the deposit.

### Limits

There is no cap on how many deposits it has ever held: a count that only grew
would let one address close it to everybody for a few atto. `terms()` therefore
lists only the most recent ids, and every deposit is read by its id.

It trusts the one register it was deployed against and no other. Deployment
checks that the address answers as a register; it cannot check that it is an
honest one, so a depositor reads `terms().register` and satisfies themselves
which contract it is before sending value. It checks that the two counted
readings are `UU`; it does not, and cannot, check that the disclosures behind
them were true.
