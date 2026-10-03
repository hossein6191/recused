# Decisions

Each choice, the reason for it, and what it cost. `docs/DESIGN.md` is the
specification; this file is why the specification says what it says.

## 1. The boundary: what the network agrees on

**The network agrees on two characters and nothing else.** For one spend
document and one member's disclosure, the value is the direction the member's
filed interests move under the branch where the spend is carried out, then
under the branch where it is not. The alphabet is `G L U ? / x`, plus `-` which
only the contract writes.

*Why two branches.* A conflict of interest in a pending decision has two sides.
A supplier gains if the spend passes. A competitor of the payee gains if it
fails, and a member whose own claim on the fund is stronger while the money is
still there gains if it fails too. Asking only "does this member benefit from
the spend" misses the second kind, and the second kind is the member most likely
to vote a spend down for their own reasons. The contract refuses both.

*Why coarse.* The difficulty of the judgment and the difficulty of agreeing on
it are separate, and the second is chosen by what the block returns. Four words
per branch is the coarsest answer that still carries the judgment. A sentence
of explanation would be one node's prose kept under everybody's authority, so
there is none: `_why` composes the published sentence from the contract's own
phrases.

*Cost.* The reading says "moved" and a direction. It does not say which entry
was moved or how much. A member who is recused learns the pair and nothing
finer.

**What is not agreed, and is never claimed:** that a disclosure is true, that a
spend is wise, who the payee really is, that an identification is honest, that
a clear member is independent in any larger sense, anything cumulative, and any
arithmetic, ordering, clock or money movement, which are all deterministic.
`rule()` publishes this list.

## 2. One block, two presentation orders, both branches in each

A model that leans on what it reads first leans the same way on every
validator, because every validator builds the prompt the same way. Consensus
alone cannot see that. So the same question is asked in both orders inside one
block, and a disagreement between the orders is part of the value.

**Branch and presentation order are separate variables.** An earlier sketch
asked the "carried out" branch with the spend first and the "not carried out"
branch with the interests first. That confounds the two: a difference between
the answers could be the branch or the order. Both prompts here ask both
branches. What differs between them is position and nothing else: the order of
the two blocks, the order of the two questions, and inside the blocks the order
of the member's entries and of the identifications. A test strips the block
lines and the question lines and checks that what is left of the instruction
text is identical character for character, and another checks on a real round
that both prompts carry the same set of lines.

**The lines inside the blocks move too.** The member being read chose the order
of their own entries, and whoever came first chose the order of the
identifications. The first draft moved only the blocks and the questions, so a
reader that attends to the head of a list answered the same way in both
askings, and a member could file the entry that matters last of six. The second
asking now prints each of those groups in the second order, every line under
its own number (`ENTRY 6 OF 6` stays so named), and such a reader lands in the
stored value as `/`. The document that is sealed and published is the first
asking's; `document()` returns the second asking's beside it.

**The second order moves everything.** `_second_order(n)` reverses an even
number of things, which already moves every one of them. An odd number is
reversed, rotated by one, and its last two exchanged, because a plain reversal
leaves the middle in place and the rotation alone returns one element to its
own position. It is checked to move every element at every size from 2 to 6,
which is as many lines as any group can hold.

*Cost.* Two model calls per countersignature, per node. A page that shows the
judged document shows one order of two; the digest is of the first.

## 3. Seven tokens, so that uncertainty lives in the value

`?` (both orders said too vague), `/` (the orders gave different directions)
and `x` (an answer could not be read) are three different things to have found
out, so they are three tokens. None of them is clear. A direction that both
orders agreed on under one branch is a finding whatever the other branch came
back as, so a value with a `G` or an `L` in it is `interested`, and `unclear` is
what is left: no direction, and not `UU` either. A validator never accepts
a value different from its own: the comparison is exact string equality on the
two characters, and there is no docstring anywhere arguing that two different
values are the same. A test greps for the shapes that argument takes.

`_clean_value` turns any block result that is not two characters of `GLU?/x`
into `xx`. A round that came back in a shape the contract did not write is
unreadable, not an error, so it cannot be thrown away and asked again.

*Cost.* An unstable or unreadable round spends the member's one attempt on that
spend. See 8.

## 4. The judged spend is the contract's document, not the poster's sentence

A poster who writes the only text the model sees can dress a spend up for it. So
the document is assembled by the contract: number, sequence number, payee
address, amount in atto and in whole GEN by integer division, the poster's
member number and address, then the poster's description in quotation marks,
then each identification under its author's number and address. `document()`
calls the same builder as the round, so a page prints the judged bytes. The
sha256 of those bytes is stored on the spend by the first judged reading and on
every judged reading after it. A round that read nothing seals nothing, and the
readings that ask no model store no digest, because they read no document.

**The quotation cannot be closed from inside.** Member text is printed inside
double quotes on a line the contract wrote. A double quote in a description
would end the quotation and let the rest of the description pass for the
contract's own words, for instance for an identification attributed to another
member. The door refuses the double quote, and `_quoted` replaces it with an
apostrophe at the prompt boundary anyway, keeping the length, and replaces
anything that could end a line with a space. This sits beside the fence,
`str(raw).replace("<", "(").replace(">", ")")`, which does the same job for the
block delimiters.

**The builders are safe on their own.** A label that is not one of the two the
contract owns prints as a fixed word, and every desk id, number and address is
checked again at the point of printing. In this contract each of them is
validated long before it gets there; the builders do not rely on that, so a
copy of them handed an unchecked value still cannot print a line of somebody
else's choosing.

**The notice window, and `identify`.** A poster can still leave out who is
being paid. So for the length of the notice window any member but the poster
whose disclosure predates the gate (section 6) may add one sentence saying who
the payee is, and nobody may countersign. The two windows do not overlap, and
`identify` is refused as well once anybody has been read on the spend, so the
claim does not rest on transaction clocks never running backwards. That gives
three things: every member had time to repair an omission before anybody could
sign, every reading on a spend is made of the same document, and the moment the
document is sealed is deterministic.

**The least notice belongs to the desk, not to the poster.** The poster is the
party the window exists to check. In the first draft the poster chose its
length, with a floor of five minutes, so the repair was open for five minutes
at an hour of the poster's choosing. The opener now fixes the desk's minimum
once, at opening, and a poster may lengthen the window and never shorten it
below that. The contract's own floor stays at five minutes so that the window
can be demonstrated in one sitting.

**The poster may not identify.** The poster has the description to say it in.
The prompt tells the reader that each identification was written by another
member, and a poster's second sentence under that heading would be the poster's
word presented as somebody else's. No spend carries an identification written
by its own poster, including one made on an earlier spend of the same run.

**Four places, and who was turned away.** A spend takes four identifications,
first come, so that the worst prompt stays inside the ceiling. Members who
agree among themselves can take the places with sentences that say little. A
member who arrives after that is not turned away in silence: the call answers
`ok: false` instead of raising, the member is counted on the spend, and the
judged document carries a line of the contract's own saying how many members
were turned away. The squeeze is then in the bytes that are read.

*Cost.* Every spend waits at least five minutes. An identification is a claim,
and a false one can get an honest member recused; it stays on the record under
its author's address, it is carried onto every later spend of the run (section
8), and the prompt tells the reader that anything a quoted text says about the
member being read counts for nothing. A line saying that members were turned
away may make a careful reader hesitate, which is the right effect and can also
be bought by four addresses.

## 5. Structure as well as prose, and addresses

A disclosure that names nothing gives a reading nothing to check, and its clear
verdict would be worth nothing. So a disclosure has at least one entry: a named
counterparty or activity, and one relation token from a closed catalogue of
fifteen. The token is checked at the door and printed as the contract's own
phrase, so no member's word ever lands on a structural line.

**The placeholder list is a word list and says so.** An entry name made only of
words such as `various`, `misc` or `business interests` is refused, with a
message that calls it a fixed list and not a judgement. It does not catch "the
market", and it is not meant to: genuine vagueness is for the reading, which
answers `?`.

**Declared addresses are compared by the contract.** A payee that is one of the
signer's declared addresses, or the signer's own enrolling address, is refused
with no model call. Declaring costs nothing and buys nothing except that
refusal, so the only reason to hide an address from the contract is to hide it
from everybody, and an undeclared address that later turns out to be the
member's is evidence. The prompt is told that the comparison has already been
made and that an address can only ever be compared as a string of characters.

*Cost.* A member must name at least one thing to take part. The catalogue has
an `other`, which requires at least twelve characters of detail.

## 6. Sequence order instead of clocks or promises

One counter numbers every event: opening a desk, enrolling, amending, posting,
identifying. `_next_seq()` is its only writer.

**The gate is on the payment, not on the spend's own number.** The first draft
read a disclosure against a spend whenever the disclosure's number was the
lower of the two. But a spend is cheap to post again: one added full stop gives
the same payee and the same amount a new number, above every amendment made
since the payment was first seen. A member recused on the first copy could
amend the conflict out of their disclosure and be read clear on the second. So
the spends posted to one payee address since the last one that was paid are one
**run**. The first posting of a run fixes its gate, every later spend of the
run stores that gate, and a disclosure is read against a spend only if its
number is lower than the gate. An amendment appends the old version to the
history and takes a new number, so it is newer than every spend already posted
and than the gate of every run that is live.

*Why the payee address.* It is the one fact about a payment that the contract
holds and the poster cannot reword. The amount and the description are the
poster's to vary, and a gate keyed by either would be walked round with a
different figure or a different sentence.

Because every event takes its own number, a disclosure and a spend can never
share one, and the gate is written `>`. Two events in the same second are still
ordered. A test asserts that the only assignments to a sequence number come
from the counter, and that the only writer of a gate is the first posting of a
run.

*Cost.* An honest member who corrects their disclosure loses their say on every
spend already open, and on every payee address that has been posted and not yet
paid. A member who joins late has no say on those addresses either, and only
the members whose disclosures predate a run can pay it; if too few of them read
clear, that address is not paid by that desk. The way out is forward: other
payees, later runs, and posting a spend oneself.

Two things the gate does not reach, both stated as limits in the README. A
second address for the same payee is a new run, because the contract cannot
know that two addresses are one payee. And a payment ends the run: the next
spend to that address is read against the disclosures then on file, so a member
who amends between two payments to the same address is read on the amended
version, with the superseded one kept in the history.

**No `resign`.** Membership compels nothing, and a removal path would also be a
way to take a disclosure out of the active record. Nothing here deletes.

## 7. Three refusals that ask no model

A declared payee, a late disclosure and a standing reading (section 8) are
refused before the block. Each writes a reading row with the value `--` and
spends the attempt on that spend, and none can come out differently later: an
address can only be taken off a disclosure by an amendment, an amendment makes
the disclosure late, and a reading that stands does so until the run ends,
which only a payment does. The first two are the defences the design leans on
hardest, which is why they cost no consensus round and cannot be argued with in
prose. The third is what keeps the consensus reading from being asked twice.

## 8. Refusals that are remembered, and the one attempt

**Procedural or final.** A procedural refusal (no such spend, not a member, the
poster, wrong window, already read) decides nothing about the signer. It is
stored in a ring of twelve and the attempt is unspent. A final refusal writes
the reading row. The reading row is the attempt key, so there is no second map
to fall out of step with it.

**Whose ring.** A desk's ring is written only by an address that holds a
disclosure on that desk. Every other refusal (value of zero sent by a stranger,
a call from an address that is not a member, a call that named no desk) goes to
one ring of its own, read as `refusals("open")`. The first draft wrote every
refusal that named a desk into that desk's ring, so a stranger could turn a
member's refusal out of it with twelve free calls. The one procedural refusal
the record exists for, a poster trying to countersign their own spend, is also
counted on the spend row as `poster_tried`, where no ring can lose it.

**Nothing a caller typed is repeated back.** A refusal names a desk id, a spend
number or an address only when the argument has the shape the contract itself
gives one. Anything else is answered in fixed words, so no stored row and no
message carries characters a caller chose.

**`approve` never raises.** A raise would roll the record back, and the same
call could then be repeated until a round suited somebody.

**An outage is not a verdict.** A round is a value only when both askings were
answered. If either asking cannot be made, the leader raises the transient
class for the whole round; when the validators, rerunning the work, fail too,
the block returns their agreed error. `approve` catches exactly that error
class around the block and stores a procedural refusal: nothing was read, the
document is not sealed and the attempt is unspent. Charging the attempt would
punish a member for an outage, and since a reading that is not clear now stands
for the whole run, storing half a round as `x` would recuse a member on a payee
address because of a connection. No caller can make the validators' models
unreachable. A round in which both askings answered is a value, however
unreadable the answers.

**Verdicts are final, and one that is not clear stands for the run.** A clear
reading that could be re-run could be destroyed by somebody else; an interested
one that could be re-run could be laundered. The first draft kept the attempt
per spend, and a spend can be posted again: the same payee and amount under a
new number was a fresh roll for the member who had just been recused, with up
to eight copies open at once, or one after another as each expired. The
measured readings are not stable enough for that to be harmless (section 14).
So the first judged reading of a member in a run that is not clear is kept for
the run, and every later spend of the run refuses that member with the verdict
`standing`, no model asked, naming the spend the reading was made on. A clear
reading does not stand: each spend is its own document, and being read again
can only cost the member.

**What was said about a payee is carried.** The first draft kept
identifications per spend, so a spend posted again shed the sentence that named
its payee and its document went back to saying that nobody had. The run now
holds up to four identifications, and each later spend of the run starts with
them, less any written by its own poster.

*Cost.* A bad round on a good day spends an attempt, and with it that member's
say on that payee address until a spend to it is paid. A hostile identification
stays in every later document of the run. Posting the spend again used to be
the remedy for both, and it is gone on purpose: it was the same door the
laundering came through. What is left is two other members, the recused member
posting the payment themselves, and another payee address, which is a new
question for everybody. The ring is a ring: enough refused calls by a desk's
members push an earlier refusal out of the view, though never off the explorer.

## 9. The money

**In.** `open_desk` and `fund` are open to anyone. The sender is recorded as
the funder. Any refusal returns the value in the same transaction and never
raises.

**Credit in units.** A funder's claim is a number of units. While nothing has
been drawn a unit is one atto; afterwards money is given units at the going
rate, `value * units outstanding // backing`, where the backing is what those
units stand for: the pot, less what funders who left have claimed on open
spends, less what is owed to them on spends that expired. The first draft
counted credit in atto and shared the pot pro rata, which made a funder who
arrived after a payment pay for part of it. When the units outstanding stand
for nothing, a new round of credit starts.

**The ceiling.** Every refill after a payment multiplies the units outstanding
by the pot before the payment over the pot after it. The total was first a u256
capped at 10^60, which a desk spent to one percent and refilled reached in 19
refills: ordinary use closed a desk to funding. The total is now a decimal
string, as each funder's units always were, and the ceiling is 10^600. A desk
spent to one percent and refilled takes 289 refills before the next is refused;
a pot of 500 GEN drawn to its last atto each time takes 27. A refused refill is
returned, and the funders can still reclaim.

**Out, to a payee.** The second clear reading latches the spend paid and updates
the desk before the transfer is emitted. A test makes the recorded transfer read
the contract's state and checks it already says `paid`.

**Out, to a funder.** `reclaim` pays the sender's share of the free balance,
`free * units // units outstanding`, at any time, and takes all of the sender's
units. What those units stood for in each open spend becomes a claim on that
spend alone, `(amount - already claimed) * units // units outstanding` atto. A
spend that is paid voids the claims on it. A spend that expires owes them back,
and that amount is held out of the free balance until each holder takes it with
their next `reclaim`.

This is the third version. The first allowed `reclaim` only while no spend was
open, which let any one member hold every funder in with a spend of one atto.
The second paid a share of the free balance and left the funder the rest of
their units as ordinary units. Ordinary units are a claim on whatever is free,
so the funder could call again and again and take most of the free balance, or
call once and, after the spend was paid, take a share of money that was the
other funders': with 50 GEN each behind a spend of 60, the funder who left
early ended with 27.5 GEN and the one who stayed with 12.5. Now each ends with
20, in either order and after any number of calls, and if the spend expires
both are made whole.

**Commitment.** A spend's amount is committed at posting and may not exceed the
free balance, so two open spends can never be paid from the same money, and
money owed on an expired spend cannot be committed to a new one. `expire`
releases the commitment; no money leaves the desk.

**Two open spends per poster.** A desk takes eight open spends. With no limit
per poster, one member could hold all eight with spends of one atto and windows
of fourteen days, and nobody else could post. A member may now hold two, so the
eight places take four posters.

*Cost.* Rounding is downward everywhere, so a reclaim can leave less than an
atto of its share of the free balance, and less than an atto per open spend,
with the funders who stay. Money that arrives while a spend is open bears its
share of that spend if it is paid, like any other credit in the desk. Nobody
can withdraw a posted spend, and members who keep the whole free balance
committed delay every funder for as long as they keep posting. `reclaim` walks
the open spends, at most eight.

## 10. Desks, rosters, and three addresses one person controls

Enrolment is free and a made-up disclosure passes, so on a desk anyone may join
one person with three addresses can post a spend and carry it. That is not
denied here; it is why a desk has a roster. The opener names the roster once,
in public, in the transaction that creates the desk, and nothing can change it
afterwards, the opener included. An empty roster means open enrolment, which is
what a visitor trying the contract uses. A roster of one or two addresses could
never carry a spend and is refused. On an open desk one person can also take
all 24 member places, and with four addresses all eight places for open spends.

The opener fixes one more thing in that transaction: the least notice a spend
on the desk must give (section 4). The opener has no other power: no veto, no
withdrawal beyond a funder's own share, no closing the desk.

*Cost.* Neither the roster nor the minimum notice can be corrected. A desk that
needs a new member, or a different notice, is a new desk.

## 11. Caps, and what is refused instead of shortened

Every text has a cap and a text over its cap is refused. Nothing judged is ever
sampled: a prompt with every text at its cap, six entries, six addresses, four
identifications and the line that counts members turned away is 10,151
characters, measured, and a test builds it. The caps on members, open spends
and identifications keep every loop bounded.

`desks()` and `spends()` show the most recent 24. Anyone may open a desk, so a
list of all of them would be something a stranger could make unreadable, and
the page of the most recent is something a stranger can push a desk off. So
`desks()` is a page and not a directory: `desks_from(start)` lists 24 from any
number, and every desk and every spend is read by its id.

## 12. Views take ids

A read call on Studio fails once the whole encoded call crosses 256 bytes. So no
view takes a document. `document(desk, n)` takes two short arguments and returns
the judged text.

## 13. The fixture

A register that only records a verdict has produced an opinion. In Recused the
verdict already moves the fund's own money. `Countersigned` is a second
consumer, a separate contract, to show the reading being relied on by code that
did not make it: it holds a deposit and pays it to a payee only if the named
desk carried the named spend, to that payee, on the document with that digest,
with two counted readings that are both `UU`. It binds to an address and a
digest and never to a desk id alone, because ids are handed out in order.

**It reads its register once, at deployment.** Every deposit is settled by
reading the register and by nothing else, `cancel` included. A copy deployed
against an address that does not answer would hold every deposit for ever. So
the constructor calls `desks()` on the address it is given and fails the
deployment unless the answer has the shape a register's has. That stops a
mistake; it does not make the register honest, so a depositor reads
`terms().register` before sending value.

**It counts nothing that only grows.** The first draft refused deposits once 64
had ever been made, and a deposit on a spend number that does not exist can be
cancelled at once, so any address could use the cap up for nothing and close
the contract to everybody. A cap on live deposits would have cost 64 atto to
fill. There is now no cap, `terms()` lists the 24 most recent ids, and every
deposit is read by its id.

## 14. Verified, and not verified

Verified offline, on this source:

- `python -m pytest tests/ -q -p no:cacheprovider`: **298 passed**. The suite
  uses a stub runtime and a simulated network in which the leader and each
  validator have their own scripted model. It drives the consensus closures
  themselves: the same value agrees, a different value disagrees, a value that
  differs in one character of two disagrees, a validator whose own rerun raises
  disagrees, an `[EXPECTED]` leader error agrees only on the identical message,
  two `[TRANSIENT]` failures agree, and a model that leans on position, of a
  block or of a line inside one, lands in the stored value as `/`. One test
  walks the whole on-chain run of `docs/DESIGN.md`, section 14, step by step,
  with the sequence numbers and the amounts the table quotes.
- `genvm-lint check`, version 0.11.0, on both contract files: first line
  `Lint passed (3 checks)`, exit code 0. It reports Recused as 24 methods, 15
  view and 9 write, and Countersigned as 5 methods, 2 view and 3 write.
- `python tools/mutate.py`: **282 defences** removed or inverted one at a time,
  **none surviving**. `tests/MUTATIONS.md` names the test that failed for each.

### What the probe measured

**Every copy below ran a revision of the contract older than this one.** The
sittings and the rehearsals were made before corrections 16 to 35 of
`docs/DESIGN.md`. What they measured is how the instruction text is read, and
of that text one sentence has changed since: the one saying that order carries
no meaning now names the lines inside the blocks as well as the blocks. Every
other sentence is as it was. In every reading below but one, the member read
had filed one entry and the spend carried at most one identification, and a
group of one line has only one order, so the documents each asking read are,
byte for byte, the documents this file would build for the same rows. The one
exception is the member who had added "the market" as a second entry, in the
first rehearsal: this file would print those two entries the other way round
in the second asking. Nothing below is evidence for what did not exist when it
ran: the run of a payee address, the reading that stands, the claims of a
funder who leaves, the second order of the lines inside the blocks.

The sentence the whole design leans on is the baseline of the second branch:
that "if the spend is NOT carried out" is read against the position as it
stands, and not against the other branch. If a model reads it comparatively, a
member whose shop was merely going to be paid reads as losing when the spend
fails, an honest bystander can read `UL`, and a desk stalls while looking as
though the mechanism works. So before anything else, `PHASE=P` of
`tests/on_chain/smoke.mjs` was run on Studio, chain 61999, on 2 October 2026,
five times, each on a throwaway copy with accounts generated for it. One spend,
"Print 500 copies of the annual report", paid to an address a member identified
as Pelican Press, was read against three disclosures: B, who part owns Pelican
Press; D, who teaches at a school that sells the fund nothing; and C, who chairs
a bike group that asks this fund for lock money most years.

| sitting | wording of the two branch sentences | B | D | C |
|---|---|---|---|---|
| 1, `0x23C3D4d02de8A026D16b4065b885716446b274F0` | the first draft | `GU`, 3 agree, 2 disagree | `UU`, 3 agree, 2 idle | `UU`, 3 agree, 1 disagree, 1 idle |
| 2, `0xcb8eB8Da2F46Abe2353dE1881e36bCA9E9E57722` | "never LOSES" added to the second branch | `GU`, 3 agree, 1 disagree, 1 idle | `UU`, 3 agree, 2 idle | `?U`, 3 agree, 2 idle |
| 3, `0x5875AD97eE800020ce569245441c28d845f2F496` | as it stands now; **nobody said who the payee is** | first round not carried (0 agree, 3 disagree); then `?U`, 3 agree, 2 idle | `UU`, 3 agree, 2 idle | `/U`, 3 agree, 1 disagree, 1 idle |
| 4, `0x012F9d0686f8FdB992a58868130810315cf72595` | as it stands now | `GU`, 3 agree, 1 disagree, 1 idle | `UU`, 3 agree, 2 idle | first round not carried (2 agree, 3 disagree); then `UU`, 3 agree, 1 disagree, 1 idle |
| 5, `0xA8F995a1C465D270Da3858041CC4fB4CA5b2b1f7` | as it stands now, on the file as it was before corrections 16 to 35 | `GU`, 3 agree, 1 disagree, 1 idle | `UU`, 3 agree, 2 idle | `UU`, 3 agree, 2 disagree |

The full run was then rehearsed twice, again on throwaway copies. In the run
the print shop spend is posted by C, so its readers are B, D and A, who keeps
the minutes of a residents association that holds no money.

| rehearsal | the file it ran | B | A | D |
|---|---|---|---|---|
| 1, `0x50Da1a3504308672E116b1F09678EB9Ce70c0482` | the file of sittings 3 and 4 | `G/`, 3 agree, 2 idle | `UU`, 3 agree, 2 disagree | `UU`, 3 agree, 2 idle |
| 2, `0x2440564B1D040be9fd7d609fc09d8b3A17940F3D` | the file of sitting 5 | first round not carried (1 agree, 3 disagree, 1 idle); then `/U`, 3 agree, 1 disagree, 1 idle | `UU`, 3 agree, 1 disagree, 1 idle | `UU`, 3 agree, 2 idle |

What that says, and what was done about it:

- **The baseline holds.** The seven copies hold 25 judged readings. The second
  character, the branch where the spend is not carried out, is `U` in 24 of
  them and `/` in one, and it is never `L`: nobody was read as losing because a
  spend failed, and no bystander was recused by that branch. In the four
  sittings where the payee was identified the part owner read `GU`: gaining if
  the spend is carried out, unmoved if it is not. Never `GL`. The first draft
  of `BRANCH_RULE` ended "UNAFFECTED unless ... the thing the spend would have
  done not being done, moves it on its own", which invites exactly the
  comparative reading, and two of five validators dissented. The sentence now
  says that for such an entry the answer to the second question is UNAFFECTED,
  never LOSES, and one of five dissents.
- **The part owner is refused every time, and is not called interested every
  time.** Six readings set the part owner of the print shop against a document
  that names the print shop: `GU` four times, `G/` once and `/U` once. All six
  were refused with the attempt spent, and no money moved on any of them. But
  `/U` holds no settled direction, so that reading is stored as unclear and not
  as interested: the two presentation orders gave different answers for the
  branch where the spend is carried out, and a majority of the validators found
  the same. The `G/` of the first rehearsal was stored as unclear too,
  under a verdict table that let an unsettled branch hide a settled one; that
  is correction 14 in `docs/DESIGN.md`, and on this file `G/` is interested.
  On this file each of the six would also stand for the run of that payee
  address, and none could be asked again by posting the payment a second time.
  The run's own check at that step expects interested and reports any other
  word as a failure. It is left strict, because whichever word comes back is
  what the Evidence section will show.
- **A claim on the fund itself is read unevenly.** C's disclosure says their
  group asks this fund for money. The first draft told the reader that "a member
  whose own claim on the fund is stronger while the money is still there" is
  moved when a spend fails, which makes every such member interested in every
  spend. That example is gone, and `MOVED_RULE` now says that the fund holding
  less money, or more, after the decision is so for every member alike and moves
  nobody on its own. Even so C read `UU`, `?U`, `/U`, `UU` and `UU` across the
  five sittings, with one round the validators did not carry and the last one
  carried by three against two. This is a limit, not a defect to be worded
  away: a member who names a claim on the fund is close to every spend, and the
  readers are right to hesitate. The full run therefore rests no payment on
  that member's reading: C posts the first spend and its two clear readings
  come from the other two members. These five readings of one member on one
  document are also the measurement behind section 8: a reading that could be
  asked again by posting the payment again would, for this member, come out
  clear on some copy.
- **An omitted payee did not launder the conflict, once.** Sitting 3 was cut off
  by a connection failure before the identification was filed, so its document
  said that no member of the fund has said who the payee is. The part owner of
  a print shop, read against a printing spend to an unnamed address, came back
  `?U`: unclear, not clear. One measurement, not a guarantee; the limit in the
  README stands.
- **One vague entry was read unclear, by another route than the design
  expected.** In the first rehearsal the member who had added "the market" to
  their disclosure read `/U` on the next spend, 3 agree and 2 disagree, where
  the run table expects `??`: the two orders did not give the same answer for
  the branch where the spend is carried out. Unclear either way, and not
  counted.
- **A round the validators do not carry stores nothing.** Four readings needed
  a second transaction: two in the sittings and one in each rehearsal. Nothing
  was written by the first, so asking again was safe, and the attempt was spent
  only by the round that settled.

Which file each copy ran: sittings 1 and 2 ran earlier wordings of two prompt
sentences and are not evidence for this source. Sittings 3 and 4 and the first
rehearsal ran the two branch sentences as they stand, on a file that wrote the
verdict from the two characters differently (correction 14). Sitting 5 and the
second rehearsal ran the file as it stood after correction 15: the source each
of those copies holds was read back from the chain and compared byte for byte
with the file of that day. None of the seven ran this file. The fixtures of the
rehearsals had a cap on deposits and did not read their register at deployment
(corrections 31 and 32).

Verified on chain, on the way:

- by the sittings: the contract deploys with the pinned runner; every write was
  accepted by the validators (the deterministic ones at 3 agree and 2 idle, or
  better); the notice window is enforced on the chain's own clock; the judged
  document comes back from `document()` exactly as the tests build it.
- by the first rehearsal, which ran every phase and passed 48 of the 49 checks
  the script then made (the other was the `G/` above): a payable refusal
  returned the value sent; the second clear reading moved 180 GEN and then
  60 GEN to their payees in the transaction that read it, measured from the
  payees' balances; the four refusals that ask no model were stored, two of
  them as readings with the value `--`; a stranger expired a spend, a second
  expiry raised, and the funder reclaimed the 260 GEN that was left; the
  fixture paid 25 GEN to the bound payee against the carried spend and returned
  10 GEN to its depositor against the expired one.
- by the second rehearsal, on the file of sitting 5, before it was cut off:
  the same refusals at the door, and 180 GEN at the print shop's address after
  the second clear reading.

Verified by the full run of 3 October 2026, on this file (register
`0x92cF8772718B76b765ba933dd9C97F447E65d219`, fixture
`0x6E14ccFbcA93A206d1752052880B746d99473B3d`, both byte-identical to the files
here; 88 transactions, 114 of 114 checks, every step in `tests/on_chain.md`):

- **All six verdicts on one deployment**: clear, interested (`GU`), unclear
  (`?/`), declared, late and standing, each stored by a majority.
- **Everything corrections 16 to 35 added**: the gate of a run, the reading
  that stands when the same payment is posted again, the identification carried
  from one spend to the next, the claim a funder holds on a spend open when
  they leave and its payment when the spend expires, and the desk's minimum
  notice refused below its floor.
- **The second clear reading pays in its own transaction**: 180 GEN to the
  print shop and 60 GEN to the bike group, read from the payees' balances.
- **A constructor may read another contract.** `Countersigned` called the
  register's `desks()` view while it was being deployed, and deployed. The
  fixture then released a deposit against a carried spend, refused a second
  release, returned a deposit bound to the wrong payee, and cancelled one.
- **The desk of six**: four identifications taken and the fifth member turned
  away and counted, with a reading made of the document that says so.

Not verified:

- **That an agreed outage is caught on the network as it is in the simulator.**
  The simulator hands an agreed leader error back to the contract as the
  runtime's error class. No sitting met an outage that every node saw. If the
  runtime does otherwise, such a round raises instead of being recorded, and
  nothing else changes.

## 15. What reading the built contract against its rules changed

Thirty-five corrections, listed in full at the end of `docs/DESIGN.md`. Each
one that changed the code is now a test and a row in the mutation table; two
of them corrected a sentence and nothing else. The ones that changed behaviour
a member or a funder would notice:

- a member's words could close the quotation the contract prints them in;
- a spend paying the signer's own address went to the model unless the address
  was also declared;
- `reclaim` could be blocked by anybody with a one atto spend;
- money that arrived after a payment paid for it;
- a roster of more than six addresses was refused, though the cap is 24;
- `approve` raised when no node could reach a model;
- the document digest was of a normalised copy, so two documents could share
  one;
- funder units of more than forty digits read back as nothing;
- a direction settled under one branch was recorded as unclear when the other
  branch had not settled;
- the same payment posted again under a new number was read against a
  disclosure written after it was first seen;
- a member recused on a spend was read afresh when the payment was posted
  again, and the new document had forgotten who the payee was said to be;
- a funder who reclaimed while a spend was open moved part of its cost onto the
  funders who stayed;
- the second presentation order left every entry and every identification where
  the member had put it;
- the poster chose how long the other members had to say who the payee is, and
  could add a sentence of their own under another member's heading;
- one member could hold every place for an open spend;
- a stranger could turn a member's refusal out of a desk's ring;
- a desk in ordinary use stopped taking refills after nineteen of them;
- any address could close the fixture to everybody for 64 atto.
