# ThingTalk Reference Manual

## Types

* `Any`: the base, or unspecified, type; use it when the other types
  are not appropriate

* `Boolean`: `true` or `false` - but also `on` or `off`

* `String`: any string; strings do not have to be valid UTF-16, but
   they are stored as UCS-2 and cannot have embedded NUL characters

* `Picture`: a URI to a picture; this

* `Number`: [IEEE754](http://en.wikipedia/wiki/IEEE754) double
  precision floating point

* `Measure(...)`: same as `Number`, but parametrized by one of the
  unit types; literals of `Measure` type have automatic conversion to
  and from the most common unit types, and the type system enforces that
  arithmetic uses commensurable units (i.e., you cannot write `1kg + 1m`,
  but you can write `1kg + 1lb`)

* `Date`: a specific point in time (date and time), like a [JavaScript Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)

* `Location`: a specific point on the Earth surface, as a pair of latitude and longitude

* `Array(elem)`: an ordered sequence of values of the same type; arrays are compared by
  value (i.e., two arrays are equal if the have the same size and are
  pair wise equal)

* `Map(key, value)`: a [dictionary](https://en.wikipedia.org/wiki/Associative_array)
  where keys have type `key` and values have type `value`; like arrays,
  maps are compared by value

* `(t1, t2, t3, ...)`: a `Tuple` type, contains a finite number of
  heterogenous values; use `(v,)` (note the comma) to construct a tuple with
  one element, but `(t)` to denote the tuple type with arity 1

* `User`: the type of members of the feed; an expression of the form `m in F` introduces
  a variable _m_ of type `User`; users have a single object property, name, which you
  access as `m.name`.

* `Feed`: the type of `F`, the feed identifier in a shared ThingTalk app; feeds
  have a single object property `length`; the number of people in the feed

## Builtin operators

* `+`: arithmetic addition if applied to `Measure(...)` or `Number`,
string concatenation if applied to `String`

* `-`: arithmetic subtraction, applies to `Measure(...)` and `Number`

* `*`: arithmetic multiplication; note that you cannot multiply two
value of type `Measure(...)` (because that would change the unit), but
you can multiply a `Measure(...)` times a `Number`

* `/`: arithmetic division; the ratio of two values of type
`Measure(...)` (which must be of the same unit) is a `Number`

* `!`, `&&`, `||`: logical connectives NOT, AND and OR

* `>`, `<`, `>=`, `<=`: comparison operators; if applied to `String`s,
values are compared lexicographically

* `=`, `!=`: equality, inequality; note that the equality operator is
special when used at the top level of a condition (see below for
Builtin predicates)

* `=~`: "like", returns true if the right hand side occurs as a
  substring of the left hand side; both arguments must be `String`s.

## Builtin Functions

* `$emptyMap() : Map(Any, Any)`: returns a new empty map of the right type

* `$append(array : Array(a), elem : a) : Array(a)`: returns a new
  array formed by appending `elem` to `array`

* `$remove(array : Array(a), elem : a) : Array(a)`: returns a new
  array formed by removing all elements equal to `elem` from `array`

* `$remove(map : Map(k, v), key : k) : Map(k, v)`: returns a new map
  with all keys equal to `elem` removed

* `$lookup(map : Map(k, v), key : k) : v`: returns the value
  corresponding to key `key` in the map, or an empty value if not
  found

* `$insert(map : Map(k, v), key : k, value : v) : Map(k, v)`: returns
  a new map obtained by replacing all occurrences of key `key` with
  value `value`, and inserting the `(key, value)` pair if missing

* `$contains(array : Array(a), elem : a) : Boolean`: returns true if
  `array` contains `elem`, false otherwise

* `$contains(map : Map(k, v), key : k) : Boolean`: returns true if
  `map` contains an element with key `key`

* `$at(array : Array(a), index : Number) : Array(a)`: returns the `index`-th
  element of `array` (0-based indexing)

* `$count(array : Array(a)) : Number`, `$count(map : Map(k, v)) :
  Number`: returns the number of values in the collection

* `$regex(text : String, pattern : String, flags : String) : Boolean`:
  returns true if `text` matches the regular expression `pattern`. See
  the
  [JavaScript documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)
  for details on the syntax.

* `$toString(x : Any) : String`: convert any value to a `String`; this should
  be used only to display to the user and is not a stable representation

* `$valueOf(v : String) : Number`: convert a string to a `Number`

* `$distance(l1 : Location, l2 : Location) : Measure(m)`: returns the distance of the two
  locations, which are assumed to be on the Earth surface

* `$latitude(l : Location) : Number`: extracts the latitude of `l`, in degrees,
  positive north of the Equator

* `$longitude(l : Location) : Number`: extracts the longitude of `l`, in degrees,
  positive east of the Greenwich meridian

* `$makeLocation(lat : Number, lon : Number) : Location`: constructs a new
  location given latitude and longitude

* `$now() : Date`: returns the current time

* `$julianday(date : Date) : Number`: converts `date` to a
  [Julian day](https://en.wikipedia.org/wiki/Julian_Day); in practice,
  it corresponds to a monotonically increasing number that identifies
  the current day, useful to compute week numbers or group by day

* `$dayOfWeek(date : Date) : Number`: returns a numeric value between 0 and 6
  for the day of week of `date`, where 0 is Sunday

* `$dayOfMonth(date : Date) : Number`: returns the day of month, between 1 and 31

* `$month(date : Date) : Number`: returns the month, between 1 and 12

* `$year(date : Date) : Number`: returns the 4 digit year of `date`

* `$makeDate(year : Number, month : Number, day : Number)`: constructs a new date
  value

* `$floor(x : Number) : Number`: returns the highest integer less than or equal to  `x`, i.e. rounds `x` towards negative infinity.

* `$ceil(x : Number) : Number`: returns the lower integer greater than or equal to  `x`, i.e. rounds `x` towards positive infinity.

* `$random() : Number`: returns a uniform random number between 0 and 1

* `$choice(v : Array(a)) : a`: returns a uniformly random element from the given array

* `$sum(array : Array(Number)) : Number`, `$sum(array : Measure(...)) : Measure(...)`: compute the sum of an array of values

* `$avg(array : Array(Number)) : Number`, `$avg(array : Measure(...)) : Measure(...)`: compute the arithmetic average of an array of values

* `$argMin(array : Array(Number)) : Number`: returns the index of the smallest element in `array`

* `$argMin(map : Map(k, v)) : k`, returns the key corresponding to the smallest value in `map`

* `$argMax(array : Array(Number)) : Number`: returns the index of the largest element in `array`

* `$argMin(map : Map(k, v)) : k`, returns the key corresponding to the largest value in `map`

* `$concat(array : Array(Any), joiner : String?) : String`:
  concatenates all elements of `array`, which are converted to a
  `String` (as by `$toString`), separating each element with `joiner`; if the second
  argument is omitted it defaults to `","`

## Builtin Predicates

Builtin predicates are special cases of builtin functions that return true when
used at the toplevel of a condition (i.e, at the level of a keyword or trigger,
with no logic combinators between them), which allow for slightly better behavior.

* `$contains(array : Array(a), elem : a)`, `$contains(map : Map(k, v),
  key : k)`: when used as a builtin predicate, the second argument can
  be unrestricted (i.e., be a new name that it's introduced in scope
  by the predicate), in which the semantics are of iterating the
  collection

* `$regex(text : String, pattern : String, flags : String, ... :
  String)`: when used as a builtin predicate, `$regex` admits
  additional arguments after the first 3, which can be unrestricted
  and are assigned (or compared to) the values of the capturing groups
  in `pattern`; for example `$regex("hello world", "[a-z]+ ([a-z])+",
  " ", v)` will set `v` to `"world"`

## Builtin Triggers

* `@$timer(time : Measure(ms))`: a trigger that fires every `time` milliseconds; `time` must be a constant or an app parameter (not a variable)

* `@$at(time : String)`: a trigger that fires at a precise point of the day; `time` must be a string of the form `"HH:MM"` in 24h format and must be a constant or an an app parameter

## Builtin Actions

* `@$notify(... : Any)`: an action that notifies the user through Almond

* `@$return(... : Any)`: similar to `@$notify`, but also terminates the app

* `@$logger(message : Message)`: post a message to the system log

## Units of Measure

The following units are valid for the type `Measure(...)`:

* `ms`: time (milliseconds)
* `m`: distance (meters)
* `mps`: speed (meters per second)
* `kg`: mass (kilograms)
* `Pa`: pressure (Pascal)
* `C`: temperature (Celsius)
* `kcal`: energy (kilocalories)

The following units are additionally recognized in measure literals, and
implicitly converted to the base unit for all operations.

| Unit                              | Base Unit | Physical quantity |
| --------------------------------- | --------- | ----------------- |
| `s` (seconds)                     | `ms`      | time              |
| `min` (minutes)                   | `ms`      | time              |
| `h` (hours)                       | `ms`      | time              |
| `day` (days)                      | `ms`      | time              |
| `week` (weeks)                    | `ms`      | time              |
| `mon` (business month = 30 days)  | `ms`      | time              |
| `year` (business year = 365 days) | `ms`      | time              |
| `km` (kilometers)                 | `m`       | distance          |
| `mm` (millimeters)                | `m`       | distance          |
| `cm` (centimeters)                | `m`       | distance          |
| `mi` (miles)                      | `m`       | distance          |
| `in` (inches)                     | `m`       | distance          |
| `kmph` (kilometers per hour)      | `mps`     | speed             |
| `mph` (miles per hour)            | `mps`     | speed             |
| `g` (grams)                       | `kg`      | mass              |
| `lb` (US pound)                   | `kg`      | mass              |
| `oz` (US ounce)                   | `kg`      | mass              |
| `bar` (bar)                       | `Pa`      | pressure          |
| `psi` (pounds per square inch)    | `Pa`      | pressure          |
| `mmHg` (millimeters of mercury)   | `Pa`      | pressure          |
| `inHg` (inches of mercury)        | `Pa`      | pressure          |
| `F` (Fahrenheit)                  | `C`       | temperature       |
| `K` (Kelvin)                      | `C`       | temperature       |
| `kJ` (kilojoule)                  | `kcal`    | energy            |

