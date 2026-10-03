# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""Countersigned: a deposit released only against a spend a desk actually carried.

A second, independent contract that turns a Recused reading into money moving.
It is deployed bound to one Recused address and reads that register through
ordinary synchronous views. No model runs here. It is small on purpose and it is
here to be read.

A depositor binds four things they already know: the desk id on that register,
the spend number, the payee address, and the digest of the judged document they
read for themselves. `release(id)` then has exactly four outcomes:

    the spend is still open            refused; nothing changes, call again later
    the spend expired                  the deposit goes back to the depositor
    the spend was paid, but its payee  the deposit goes back to the depositor,
    or its document digest is not      with the reason stored
    the one bound
    the spend was paid, the payee and  the deposit is paid to the bound payee
    the digest match, and both
    counted approvals carry UU

A desk id is never authority on its own: ids are handed out in order, and
whoever opens the next desk gets the next id. So the depositor names the register
at deployment and the payee and the document digest at deposit, and the contract
enforces that binding before it pays, refunding otherwise.

Every deposit is settled by reading the register, and by nothing else. So the
register is read once at deployment, and a deployment against an address that
does not answer as a register fails before anybody can send value here. There
is no cap on how many deposits the contract has ever held: a count that only
grew would let one address close the contract to everybody for a few atto.
"""

import json
import typing

from genlayer import *


@gl.evm.contract_interface
class _Payee:
    class View:
        pass

    class Write:
        pass


ERROR_EXPECTED = "[EXPECTED]"
ZERO = "0x0000000000000000000000000000000000000000"
HEX = "0123456789abcdef"

HELD = "held"
RELEASED = "released"          # paid to the bound payee
RETURNED = "returned"          # the spend expired, so the deposit went back
REFUSED = "refused"            # the spend was paid but not the one bound, so the deposit went back
CANCELLED = "cancelled"        # the depositor took it back while the bound spend did not exist
DONE = (RELEASED, RETURNED, REFUSED, CANCELLED)

CLEAR_VALUE = "UU"             # the one stored reading this contract will pay against
SPEND_OPEN = "open"
SPEND_PAID = "paid"
SPEND_EXPIRED = "expired"

MIN_AMOUNT = 1
DEPOSITS_PAGE = 24             # terms() lists the most recent ids; every deposit is still read by its id
NOT_SHOWN = "(not shown)"      # printed in place of a text this contract will not repeat back


def _fail(message: str) -> typing.NoReturn:
    raise gl.vm.UserError(ERROR_EXPECTED + " " + message)


def _low(address: typing.Any) -> str:
    return (address.as_hex if hasattr(address, "as_hex") else str(address)).lower()


def _is_address(text: str) -> bool:
    s = str(text).strip().lower()
    return len(s) == 42 and s.startswith("0x") and all(ch in HEX for ch in s[2:]) and s != ZERO


def _is_digest(text: str) -> bool:
    s = str(text).strip().lower()
    return len(s) == 64 and all(ch in HEX for ch in s)


def _is_desk_id(text: str) -> bool:
    """Exactly the ids the register assigns: D, then 1 to 9 ASCII digits with no leading zero.

    `str.isdigit` would also accept a superscript two or Arabic-Indic digits, and
    "D01" is not "D1": the register never reaches such an id, so a deposit bound
    to one could never be released.
    """
    s = str(text).strip()
    digits = s[1:]
    return (len(s) >= 2 and len(digits) <= 9 and s[0] == "D" and digits[0] != "0"
            and all(ch in "0123456789" for ch in digits))


def _whole(raw: typing.Any) -> int:
    s = str(raw).strip()
    if not s or len(s) > 40 or not all(ch in "0123456789" for ch in s):
        return -1
    return int(s)


def _plain(raw: typing.Any, most: int) -> str:
    """A short text as it may be repeated in a message, or a fixed word.

    Printable ASCII with no angle bracket and no double quote, and no longer
    than `most`. Whatever a caller typed, or a register answered, is repeated
    back only when it is that plain.
    """
    s = str(raw)
    if 0 < len(s) <= most and all(32 <= ord(ch) <= 126 and ch not in '<>"' for ch in s):
        return s
    return NOT_SHOWN


class Countersigned(gl.Contract):
    register: Address
    n_rows: u32
    rows: TreeMap[str, str]          # "1"                      -> JSON deposit; ids run "1" to "<n_rows>"
    live: TreeMap[str, str]          # "D1:S2:<addr>"           -> the id of that depositor's live deposit

    def __init__(self, register: str) -> None:
        if not _is_address(str(register)):
            _fail("the register is a 0x address of 40 hexadecimal digits")
        self.register = Address(str(register).strip())
        self.n_rows = u32(0)
        # Every deposit here can only ever be settled by reading this register. So it is read once
        # now, and a deployment against an address that does not answer as one fails, before anybody
        # can send value to a contract that could never give it back.
        if not self._answers():
            _fail("the address given does not answer as a Recused register: its desks() view did not return "
                  "the page of desks a register returns")

    @gl.public.write.payable
    def deposit(self, desk: str, spend: str, payee: str, doc_digest: str) -> str:
        """Hold value against one spend of the bound register. Anyone; the sender is the depositor.

        The sender check is the whole authority rule: the row is written under the
        sender's own address, the live key is keyed by it, and a sender who
        already has a live deposit on this spend is refused. A refusal returns
        what was sent in the same transaction.
        """
        value = gl.message.value
        sender = gl.message.sender_address
        me = _low(sender)
        desk_id = str(desk).strip()
        n = _whole(spend)
        payee_hex = str(payee).strip().lower()
        digest = str(doc_digest).strip().lower()
        problem = ""
        live = self._live(desk_id, n, me)
        if live != "":
            problem = ("this address already has a live deposit on " + desk_id + " S" + str(n) + " as deposit "
                       + live)
        elif int(value) < MIN_AMOUNT:
            problem = "send an amount greater than zero"
        elif not _is_desk_id(desk_id):
            problem = "a desk id is D followed by digits, as the register assigns them"
        elif n < 1:
            problem = "the spend number is a whole number, at least 1"
        elif not _is_address(payee_hex):
            problem = "the payee is a 0x address of 40 hexadecimal digits and not the zero address"
        elif not _is_digest(digest):
            problem = ("the document digest is 64 hexadecimal characters, the sha256 the register's "
                       "document(desk, spend) view publishes")
        if problem:
            if int(value) > 0:
                _Payee(sender).emit_transfer(value=u256(int(value)))
            return json.dumps({"ok": False, "reason": problem, "returned": str(int(value)), "by": me})
        self.n_rows = u32(int(self.n_rows) + 1)
        row_id = str(int(self.n_rows))
        self.rows[row_id] = json.dumps({
            "id": row_id, "by": me, "desk": desk_id, "spend": "S" + str(n), "n": n, "payee": payee_hex,
            "doc_digest": digest, "amount": str(int(value)), "state": HELD, "why": "", "to": ""})
        self.live[desk_id + ":S" + str(n) + ":" + me] = row_id
        return json.dumps({"ok": True, "deposit": row_id, "by": me, "desk": desk_id, "spend": "S" + str(n),
                           "payee": payee_hex, "doc_digest": digest, "amount": str(int(value)), "state": HELD})

    @gl.public.write
    def release(self, deposit_id: str) -> str:
        """Settle a deposit against what the register already decided. Anyone may call it.

        Deliberately open to anybody, with no sender check at all, and listed as
        such in the static test with this reason: the caller chooses nothing. The
        payee, the amount, the desk and the spend were fixed by the depositor, and
        the outcome is fixed by the register's own row, so a depositor who went
        away cannot strand a payee. Every outcome is latched on this contract
        before any transfer is emitted.
        """
        row_id = str(deposit_id).strip()
        if row_id not in self.rows:
            _fail("no deposit " + _plain(row_id, 12))
        row = json.loads(str(self.rows[row_id]))
        if row["state"] != HELD:
            _fail("deposit " + row_id + " is already " + str(row["state"]))
        seen = self._seen(row["desk"], row["n"])
        state = str(seen.get("state", ""))
        if state == "":
            _fail("the register has no " + str(row["desk"]) + " " + str(row["spend"]) + "; the depositor may cancel")
        if state == SPEND_OPEN:
            _fail(str(row["spend"]) + " on " + str(row["desk"]) + " is still open; nothing is settled before the "
                  "desk carries it or its window ends")
        amount = int(row["amount"])
        if state == SPEND_EXPIRED:
            return self._close(row_id, row, RETURNED, row["by"], amount,
                               str(row["spend"]) + " expired without two clear countersignatures")
        if state != SPEND_PAID:
            _fail("the register answered a state this contract does not know (" + _plain(state, 12)
                  + "); nothing is settled on a word it cannot read")
        if str(seen.get("payee", "")).lower() != row["payee"]:
            return self._close(row_id, row, REFUSED, row["by"], amount,
                               "the register paid " + _plain(seen.get("payee", ""), 42) + ", not the payee "
                               "this deposit was bound to")
        if str(seen.get("doc_digest", "")).lower() != row["doc_digest"]:
            return self._close(row_id, row, REFUSED, row["by"], amount,
                               "the judged document of " + str(row["spend"]) + " is not the one this deposit was "
                               "bound to")
        if int(seen.get("approvals", 0)) != 2:
            return self._close(row_id, row, REFUSED, row["by"], amount,
                               "the register counted " + str(int(seen.get("approvals", 0)))
                               + " countersignatures")
        one = str(seen.get("approver1_value", ""))
        two = str(seen.get("approver2_value", ""))
        if one != CLEAR_VALUE or two != CLEAR_VALUE:
            return self._close(row_id, row, REFUSED, row["by"], amount,
                               "the two counted readings are " + _plain(one, 4) + " and " + _plain(two, 4)
                               + ", and this contract pays only against " + CLEAR_VALUE + " twice")
        return self._close(row_id, row, RELEASED, row["payee"], amount,
                           str(row["spend"]) + " was carried with two clear readings")

    @gl.public.write
    def cancel(self, deposit_id: str) -> str:
        """The depositor takes a deposit back while the bound spend does not exist on that desk.

        The sender check is the whole authority rule: the sender must be the
        address written on the row as its depositor, and the money goes back to
        that address. A spend that exists always ends, because its window has a
        deadline anybody may act on, so a deposit on one waits for `release`.
        """
        row_id = str(deposit_id).strip()
        if row_id not in self.rows:
            _fail("no deposit " + _plain(row_id, 12))
        row = json.loads(str(self.rows[row_id]))
        if _low(gl.message.sender_address) != str(row["by"]):
            _fail("only the address that made deposit " + row_id + " may cancel it")
        if row["state"] != HELD:
            _fail("deposit " + row_id + " is already " + str(row["state"]))
        if str(self._seen(row["desk"], row["n"]).get("state", "")) != "":
            _fail(str(row["spend"]) + " exists on " + str(row["desk"]) + " and every spend ends, because its window "
                  "has a deadline anybody may act on; wait and call release")
        return self._close(row_id, row, CANCELLED, row["by"], int(row["amount"]),
                           "the register has no " + str(row["spend"]) + " on " + str(row["desk"]))

    @gl.public.view
    def held(self, deposit_id: str) -> str:
        row_id = str(deposit_id).strip()
        if row_id not in self.rows:
            return json.dumps({"error": "no deposit " + _plain(row_id, 12)})
        return json.dumps(json.loads(str(self.rows[row_id])))

    @gl.public.view
    def terms(self) -> str:
        """The register, how many deposits there have been, and the ids of the most recent of them."""
        total = int(self.n_rows)
        start = max(1, total - DEPOSITS_PAGE + 1)
        return json.dumps({
            "register": _low(self.register), "deposits": total, "first": start,
            "ids": [str(k) for k in range(start, total + 1)],
            "pays_against": "a spend of the bound register that is paid, whose payee and judged-document digest "
                            "are the ones the deposit was bound to, and whose two counted readings are both "
                            + CLEAR_VALUE,
            "outcomes": {SPEND_OPEN: "refused, nothing changes", SPEND_EXPIRED: RETURNED,
                         "paid but not the one bound": REFUSED, "paid and bound": RELEASED},
            "binding": "a desk id is not authority on its own, because ids are handed out in order; the register "
                       "address is bound at deployment and the payee and the document digest at deposit",
        })

    # --------------------------------------------------------------- helpers

    def _answers(self) -> bool:
        """Whether the bound address answers as a register: its desks() view returns a page of desks.

        The call itself is not wrapped: an address that cannot be read at all
        reverts the deployment, which is the outcome wanted.
        """
        raw = gl.get_contract_at(self.register).view().desks()
        try:
            out = json.loads(str(raw))
        except Exception:
            out = None
        return isinstance(out, dict) and "count" in out and isinstance(out.get("rows"), list)

    def _live(self, desk_id: str, n: typing.Any, who: str) -> str:
        """The id of that address's live deposit on that spend, or "" when it has none."""
        key = str(desk_id) + ":S" + str(n) + ":" + str(who)
        if key not in self.live:
            return ""
        row_id = str(self.live[key])
        return "" if row_id == "0" else row_id

    def _seen(self, desk_id: str, n: typing.Any) -> typing.Dict[str, typing.Any]:
        """What the bound register says about one spend, through an ordinary synchronous view.

        The call itself is not wrapped: a register that cannot be read reverts the
        whole transaction, which changes nothing and leaves the caller free to try
        again. Swallowing that failure would let an unreadable minute look like
        "no such spend", which is the one answer `cancel` acts on.
        """
        raw = gl.get_contract_at(self.register).view().spend(str(desk_id), str(n))
        try:
            out = json.loads(str(raw))
        except Exception:
            out = {}
        return out if isinstance(out, dict) else {}

    def _close(self, row_id: str, row: typing.Dict[str, typing.Any], state: str, to: str, amount: int,
               why: str) -> str:
        """Latch the outcome on this contract, then pay. The latch precedes the transfer, every time."""
        row["state"] = state
        row["why"] = why
        row["to"] = to
        self.rows[row_id] = json.dumps(row)
        key = str(row["desk"]) + ":" + str(row["spend"]) + ":" + str(row["by"])
        if key in self.live:
            # Nothing is ever removed from a map here: a settled deposit's pointer is
            # rewritten to "0", which frees that address to deposit on that spend again
            # and leaves the row itself standing for anybody to read.
            self.live[key] = "0"
        if amount > 0:
            _Payee(Address(str(to))).emit_transfer(value=u256(amount))
        return json.dumps({"ok": state == RELEASED, "deposit": row_id, "state": state, "to": to,
                           "amount": str(amount), "reason": why})
