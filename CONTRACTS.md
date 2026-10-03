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
by it under either branch of the decision.

### Consensus

One nondeterministic block, in `approve`, per countersignature that reaches it.

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
- The second clear reading on any spend of the live run pays it and ends the
  run. The next spend to that address starts another, with a new gate, nothing
  standing and nothing carried.

### State

```
Desk     opener, label, roster_json, pot, committed, drawn, funded_total (a decimal string),
         claims_open, claims_due, open_json, n_members, n_spends, n_open, n_paid, n_expired,
         n_readings, n_refusals, opened_at, opened_seq, fund_round, min_notice
Member   who, desk, number, statement, entries_json, addresses_json, n_entries, n_declared,
         filed_seq, filed_at, version, digest, open_posted
Spend    desk, number, poster, payee, amount, description, digest, doc_digest, posted_seq,
         gate_seq, run, posted_at, notice_until, window_until, state, approvals, approver1,
         approver2, n_idents, shut_out, n_attempts, poster_tried, claimed, paid_at, expired_at,
         poster_declared

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
```

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
| `open_desk(label, roster_csv, min_notice_minutes)` payable | anyone | open by design; the sender is recorded as opener and funder; the roster and the minimum notice (5 to 1,440 minutes) are fixed here for ever | returns `ok: false`, stores the refusal, returns the value sent |
| `fund(desk)` payable | anyone | open by design; the credit is written under the sender's address | returns `ok: false`, stores the refusal, returns the value sent |
| `enrol(desk, statement, entries_json, addresses_csv)` | an address on the roster, or anyone on an open desk | the row is keyed by the sender; a sender with a row is refused; a sender not on the roster is refused | raises `[EXPECTED]` |
| `amend(desk, statement, entries_json, addresses_csv)` | the member | the row rewritten is the one keyed by the sender; a sender with no row is refused | raises `[EXPECTED]` |
| `post_spend(desk, payee, amount, description, notice_minutes, window_minutes)` | a member | a sender with no row on the desk is refused; a sender with two open spends of their own is refused; the payee may not be the sender; `notice_minutes` may not be below the desk's minimum | raises `[EXPECTED]` |
| `identify(desk, spend, text)` | a member, not the spend's poster, whose disclosure predates the gate | a sender with no row is refused; the spend's poster is refused; a sender whose `filed_seq` is above the spend's `gate_seq` is refused; one per sender | raises `[EXPECTED]`, except when the four places are taken: then it returns `ok: false`, counts the sender on the spend as turned away, and the judged document says how many were |
| `approve(desk, spend)` | a member, not the poster, once | not enrolled, the poster, an earlier reading by the sender, the sender's own address as payee, a standing reading of the sender's: each refused | never raises; see below |
| `expire(desk, spend)` | anyone, after `window_until` | open by design; the caller chooses nothing | raises `[EXPECTED]` |
| `reclaim(desk)` | a funder | the units and the claims read are the sender's rows; the transfer goes to the sender | raises `[EXPECTED]` |

`enrol`, `amend`, `post_spend`, `expire` and `reclaim` raise because nothing is
decided in them and no value arrives with them: a raise changes nothing and the
explorer shows the reason. `identify` raises for the same reason, except for
the one refusal that has to be remembered. `open_desk` and `fund` take value, so
they never raise. `approve` decides, so it never raises.

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
| 9 | the payee is the sender's own address or one they declared | final, `declared`, value `--`, no model |
| 10 | the sender's `filed_seq` is above the spend's `gate_seq` | final, `late`, value `--`, no model |
| 11 | the sender's earlier reading in this run was not clear | final, `standing`, value `--`, no model; the row names the earlier spend, its value and its verdict |
| 12 | the spend already counts two (unreachable: the second clear reading latches it paid) | procedural |
| 13 | the judged document's digest differs from the sealed one (unreachable: no identification is taken once the notice window has closed or anybody has been read) | procedural |
| | the nodes agreed that a model could not be reached | procedural; nothing is sealed |
| | the round returned a value that is not `UU` | final, `interested` or `unclear`; the document is sealed; the reading stands for the run |
| | the round returned `UU` | counted; the document is sealed; the second one pays |

On the second clear reading, in this order: the second approver is recorded, the
state is set to `paid`, the pot, the commitment, the drawn total, the claims of
funders who left and the counters are updated, the run of the payee address is
ended, and then the transfer to the payee is emitted.

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
units, so further calls take nothing from the free balance.

### Methods that read

| view | arguments | returns |
|---|---|---|
| `desk(desk)` | `"D1"` | label, opener, roster, pot, committed, claims_open, claims_due, free, drawn, funded_total, the counters, the open spends, fund_round, min_notice_minutes, the clock |
| `desks()` | | the 24 most recently opened desks, with the count and the first id shown; a page, not a directory |
| `desks_from(start)` | `"1"` | 24 desks from that number onwards |
| `member(desk, addr)` | | the whole disclosure, each relation with the contract's phrase for it, the sequence number, the version, the digest, and how many open spends the member has posted |
| `members(desk)` | | every member's number, address, sequence number, version and counts |
| `spend(desk, n)` | `"D1"`, `"4"` | every field of the spend, both counted approvers and the value each stored; with `gate_seq`, `run`, `shut_out`, `poster_tried` and `claimed` |
| `spends(desk)` | | the 24 most recent spends of the desk |
| `run(desk, payee)` | `"D1"`, an address | the run of that payee address: its number, whether it is live, its gate, its first spend, and the identifications it holds |
| `reading(desk, n, addr)` | | one stored reading: value, verdict, the contract's sentence, the document digest, the sequence numbers, the gate and the run; a standing one also names the earlier spend |
| `readings(desk, n)` | | every reading on the spend, in the order written, and `poster_tried` |
| `document(desk, n)` | | the spend document as the first asking reads it, its sha256, the sealed digest, the same lines as the second asking reads them, and which window is open |
| `idents(desk, n)` | | every identification with its author, the spend it was first made on if it was carried, and how many members were turned away |
| `refusals(desk)` | `"D1"` or `"open"` | that ring of procedural refusals |
| `credit(desk, addr)` | | that funder's units, their claims on open and expired spends, the free balance, and what `reclaim` would pay now |
| `rule()` | | the agreement rule, the tables, the limits and what is never agreed, in words |

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
| roster | empty, or 3 to 24 addresses |
| members of an open desk | up to 24 |
| members before a spend may be posted | 3 |
| open spends | 8 per desk, 2 per poster |
| notice window | the desk's minimum (5 to 1,440 minutes, fixed at opening) to 1,440 minutes |
| whole window | the notice window plus at least 10 minutes, at most 20,160 minutes |
| funder credit | at most 10^600 units per desk, kept as a decimal string |
| every text | printable ASCII on one line, with no `<`, no `>` and no double quote |

A text over its cap is refused. Nothing judged is ever shortened or sampled; a
prompt with every text at its cap is 10,151 characters.

## contracts/fixtures/countersigned.py

### Purpose

A deposit that is released to a payee only against a spend that a desk of one
named Recused contract carried with two clear readings. It shows the reading
being consumed by a contract that did not make it. No model runs in it.

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
| `terms()` view | | | the register, how many deposits there have been, the ids of the 24 most recent, and what the contract pays against |

`release`:

| the register says | outcome |
|---|---|
| no such spend | raises; the depositor may cancel |
| `open` | raises; nothing changes |
| `expired` | the deposit goes back to the depositor, state `returned` |
| `paid`, but another payee, another document digest, a count that is not two, or a counted reading that is not `UU` | the deposit goes back to the depositor, state `refused`, with the reason |
| `paid`, the bound payee, the bound digest, two counted readings both `UU` | the deposit is paid to the bound payee, state `released` |
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
