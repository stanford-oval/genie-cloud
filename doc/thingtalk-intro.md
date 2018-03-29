# ThingTalk by examples

## What is ThingTalk?

ThingTalk is the programming language that ThingEngine (and by extension Almond) uses. It's a _declarative
domain-specific language_, which means it's a language that we specifically developed
for the Internet of Things (hence the name) and it does not use common constructs
like for, if or lambdas, hopefully providing a higher level abstraction for connecting
things.

## What can I write in ThingTalk?

ThingTalk shares similar spirit with the well-known 
[IFTTT](https://ifttt.com/) service, but provides a more powerful and flexible way to express
more complicated tasks.

Each app is composed of a list of rules, each containing a trigger, an optional list
of conditions, and an action. The trigger determines when the action is executed,
and the conditions further limit it.

## The Basics

Let's start with the basics: like every programming language, we start from Hello World.
This tutorial assumes that you already have configured Almond. If not, see the [Getting Started Tutorial](/getting-started.md)
first.

This is the code for the Hello World app:

    HelloWorld() {
        true => @$notify("Hello, world!");
    }

Go ahead and copy paste it in the [New App](/thingpedia/apps/create) form,
then enable the resulting app from [your Almond](/apps).

Here we can see we define our app to have codename `HelloWorld`, and we include one rule in it, composed of everything
in the block up to the semicolon.

The rule has two parts: the part before the `=>` is called a trigger, and defines
when the code runs, the part after is called an action, and defines what to do.
Here the trigger is just `true`, which means it's always triggering.
For the action, we learn from the [ThingTalk reference](/doc/thingtalk-reference.md)
that `@$notify` produces a notification of something happening, and as
arguments wants what we're notifying about. So we pass it `"Hello, world!"` and
we're done.

## Actual conditions

A condition that is always true is not a particularly interesting condition.
Furthermore, because we're not using any trigger or any state, the condition will
never change (if it's true it stays true, if it's false it stays false), so the
rule will only be evaluated once!

Instead, we want the left hand side of the rule to contain a real trigger, for
example:

    TwitterExample() {
        @twitter.source(text, _, _, "sabrinaapp", _, _)
        => @$notify(text);
    }

What's going on here? We learn from
[the interface definition](/thingpedia/devices/by-id/com.twitter)
that `@twitter` is the name of a Twitter Account (which is mapped
to `com.twitter` when we add it), and `source` is a trigger with 6
arguments: `text`, `hashtags`, `urls`, `from`, `inReplyTo` and
`yours`.

We don't care about some of these, so we put `_` in their place.
We do care about the text of the tweet, so we _bind_ it to the variable `text`.
This is similar to Datalog or other logic programming languages, and effectively means that the
every time the trigger happen, the `text` variable in the scope of the rule will contain the
first value produced by the trigger.
Furthermore, in place of `from` we put a constant `"sabrinaapp"`, which
means we only want tweets from that account (the official Almond account on
Twitter).

So this is notifying us of all tweets from `"sabrinaapp"` as we receive
them! Cool, huh?

## Smarter Matching

In the previous example we could directly match the author of the tweet
because `from` is a single value so we could compare it to a constant. The same
trick does not work if we want to look for keywords in the text, or if we
want to look for a hashtag. Instead, this is how you would do it:

    TwitterHashtagExample() {
        @twitter.source(text, hashtags, _, _, _, _), $contains(hashtags, "sabrina")
          => @$notify(text);
    }

The part after the comma is a condition, that further limits the execution of the rule. You
can have as many conditions as you want, and they all have to be true when the trigger happen,
or the rule will be ignored until the next occurrence of the trigger (in this case, the next
tweet).

The condition can be composed of any of the functions and the operators from the
[ThingTalk reference](/doc/thingtalk-reference.md). Operator precedence and meaning matches
JavaScript and is what you would expect from other languages.
For example, we can use regular expressions to match on keywords in the text that
are not hashtags:

    HelloTwitterWorld() {
        @twitter.source(text, _, _, from, _, _), $regex(text, "hello", "i")
          => @twitter.sink("@" + from + " world");
    }

This second condition uses `$regex(text, regexp, flags)`, a condition which is true when `text`
matches the regular expression `regexp` (in [JavaScript syntax][JSRegExp]).

In this case the rule matches when the tweet contains "hello" as a substring -
including "hello", "hello Almond" but also "othello". If you want to match just "hello" as a
word, you could instead use `"\\\\sshello\\\\s"` or `"\\\\bhello\\\\b"` (note the double escaping of
backlashes, which are special characters in strings).

Look at JavaScript to find out what regular expressions are supported, as the well as what `flags` is for (in our case,
it just tells the runtime to do case-insensitive matching, so that "Hello" and "hello" both
work).

The result is an automatic Twitter replier that posts world to whoever says hello on Twitter.

## Parametric apps

So far we only matched on fixed values - fixed Twitter users, fixed hashtags. What about
letting the user choose what he cares about?

We can achieve that with parametrization:

    TwitterParamExample(HashTag : String) {
        @twitter.source(text, hashtags, _, _, _, _), $contains(hashtags, HashTag)
          => @$notify(text);
    }

Now when you enable this app you will notice a form field asking you for a HashTag.


## Maintaining state

All examples we've seen so far are stateless: you see one tweet, you do something on it,
and the potentially something happens. But how do we keep state from one invocation of
the rule to another?

We can achieve that with local variables:

    WeightExample() {
        var MyWeight : Measure(kg);
        @(type="scale").source(_, w), !MyWeight(_) => MyWeight(w);
        @(type="scale").source(_, w2), MyWeight(w1) =>
          @$notify("Your weight increased by " + $toString(w2 - w1) + " kgs");
    }

The syntax is `var VarName : Type`, and you can see the list of allowed types in
the [ThingTalk reference](/doc/thingtalk-reference.md).

Variables can be bound in conditions to read their value: `VarName(v)` reads as
"let `v` be the value of `VarName`", as if `VarName` was a trigger. The syntax
`!VarName(_)` is used to check if a variable has no value.

Variables declared with `var` are only visible to the app. You can use `out`
for variables that are useful to the user and should be presented in the result
page, and you can use `extern` for variables that are shared between multiple apps.
`extern` variables are also `out` implicitly.

## Naming things

We used `@twitter` for Twitter, but `@(type="scale")` for a scale. Why is that?

Well, some things have _global names_, for example `@omlet`, `@twitter`, `@facebook`,
while other things can only be referred to by attributes. The attribute `type`,
which is required, can be any of the types of the device as listed on Thingpedia.

So for example:

- `@(type="scale")` matches all scales
- `@(type="scale", place="bathroom")` matches all scales in the bathroom
- `@(type="com.bodytrace.scale")` matches only scales manufactured by BodyTrace
(a subset of `@(type="scale")`).

Types imply what actions and triggers are available, so by using more specific
types you might get access to new actions or triggers, at the cost of generality.

## Data Structures

We first saw a variable of type `Measure(kg)`. From [the reference](/doc/thingtalk-reference.md)
we learn variables can also have type `Array` or `Map`, which lets us store arbitrary
amounts of data in our app.

For the most parts, a variable of data structure type is treated like any other variable:

    var V1 : Array(String);
    @some.input(v), V1(array) => V1($append(array, v));

One should observe though the difference between these two similar rules:

    V1(array), V2(v) => V1($append(array, v));
    V2(v) => V1($append(V1, v));

In the first case, the rule is triggered by changes in `V1` and `V2` equally.
Because every execution of the rule appends a value to `V1` (thus changing it),
this leads to an infinite loop. The second rule is triggered only by `V2` and
does not have this problem.

You can iterate data structures with a special form of `$contains()`:

    var V1 : Array(String);
    V1(array), $contains(array, elem) => @$logger("Array contains " + elem);

As usual, `elem` binds to every possible value that makes the condition true,
so every element of the array in order.

`$contains()` in this form must be a the top of a condition, so expressions like
`V1(array), $contains(array, e1) || $contains(array, e2)` are not valid.


[IFTTT]: http://ifttt.com
[JSRegExp]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp
