# Made the terminal demo's y/n prompt a real interaction

**What:** The scripted terminal popup's `Apply this? (y/n)` line used to be the last line of a
purely typed-out, non-interactive animation. It's now a live `<input>`: typing `y`/`yes`/
`yeah`/`yup`/`yep`/`sure`/`ok`/`okay` and pressing Enter accepts (animates a progress bar to a
success line), `n`/`no`/`nope`/`nah`/`negative`/`never` declines (a short "cancelled" message),
and anything else reprompts with a nudge.

**Why:** Requested directly - "some user play there and they can be fun." The interesting
part is what "fun" meant here in practice: not a joke or an easter egg, but treating the
decline path as a *positive* outcome ("Cancelled - exactly the point") rather than an error
or a dead end, since this product's actual pitch is "changes nothing until you say so." A
generic "operation cancelled" message would have undersold the one thing this popup exists to
demonstrate.

**Outcome:** Shipped. The input is styled to inherit the surrounding line's font/weight/color
so it reads as typed shell text rather than an obvious web form control - a plain
`<input>` with default browser chrome would have broken the terminal illusion the rest of
the popup works to maintain.

**Lesson:** When a demo/marketing surface asks for "make it interactive/fun," check whether
the product's own core pitch gives a more specific answer than generic delight - here, the
"positive decline" framing came directly from the product's actual value proposition, not
from guessing what would be entertaining.
