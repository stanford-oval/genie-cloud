# ThingTalk Reference Manual

[[toc]]

## Types

* `Boolean`: `true` or `false`.

* `String`: any string; strings do not have to be valid UTF-16, but
   they are stored as UCS-2 and cannot have embedded NUL characters.

* `Enum(e1, e2, ...)`: enumerated type, having values `e1`, `e2`, etc.
   (e.g. `Enum(on,off)` represents the possibility of being `on` or `off`).
   In Javascript, this is represented as a String (the enum value).

* `Entity(...)`: an identifier to an object; the type is parametrized with
the actual entity type. An entity has a value, and an optional `display`
property that represents the user visible name of the object. In JavaScript,
entities can be represented as simple strings, or using the `Thingpedia.Value.Entity` class. 
For example, the stock ID of Google can be represented as:
    ```javascript
    new Thingpedia.Value.Entity("goog", "tt:stock_id", "Alphabet Inc.")
    ```

  The following entity types have special meaning to the semantic parser:
  
  - `Entity(tt:picture)`: a picture (identified by its URL)
  - `Entity(tt:hashtag)`: a hashtag (a word preceded by the \# sign)
  - `Entity(tt:username)`: a username (a word preceded by an \@ sign)
  - `Entity(tt:path_name)`: a path or file name
  - `Entity(tt:url)`: a URL (not necessarily pointing to a picture)
  - `Entity(tt:phone_number)`: a phone number
  - `Entity(tt:email_address)`: an email address
  - `Entity(tt:device)`: a Thingpedia device type (e.g. `com.twitter`)
  - `Entity(tt:function)`: a Thingpedia function identifier, composed of device type + `:` + function name (e.g. `com.twitter:post`)
  
  The full list of entity types is available at [ThingTalk Entity Types](/thingpedia/entities). Custom Entity types can be defined, using a prefix other than `tt:`.

* `Number`: [IEEE754](http://en.wikipedia.org/wiki/IEEE_754) double
  precision floating point.

* `Measure(...)`: same as `Number`, but parametrized by one of the
  unit types; literals of `Measure` type have automatic conversion to
  and from the most common unit types, and can be written as a sum of multiple
  terms (e.g. `6ft + 3in`).
  In Javascript, this is represented as a number, to be interpreted 
  in the [base unit](#units-of-measure) of the `Measure` type. 
  For example, `6ft + 3in` will be converted to `1.905m`, 
  and will be interpreted as `1.905` in Javascript.
  
* `Currency`: a `Number` with a unit. This differs from `Measure` because
the unit is not normalized, and is accessible at runtime. In JavaScript this type
is represented as a number (the unit will default to US dollar), 
or using the `Thingpedia.Value.Currency` type. For example:
    ```javascript
    new Thingpedia.Value.Currency(100, 'usd')
    ```

* `Date`: a specific point in time (date and time).
In JavaScript this is represented with the [Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) class.

* `Time`: a time of day without date. 
In JavaScript this is an object of class `Thingpedia.Value.Time` with `.hour`, `.minute` and `.second` property.
For example, 7 PM is represented as:
   ```javascript
   new Thingpedia.Value.Time(19, 0, 0) 
   ```

* `Location`: a specific point on the Earth surface, as a pair of latitude and longitude, and optional name. 
In JavaScript this is an object of class `Thingpedia.Value.Location`.
It has 3 properties: the latitude, the longitude, and the name of the location (optional). 
For example, we work here: 
    ```javascript 
    new Thingpedia.Value.Location(37.43, -122.1733, "Gates Computer Science, Stanford").
    ```
* `Array(elem)`: an ordered sequence of values of the same type; arrays are compared by
  value (i.e., two arrays are equal if the have the same size and are
  pair wise equal)

* `(t1, t2, t3, ...)`: a `Tuple` type, contains a finite number of
  heterogenous values; use `(v,)` (note the comma) to construct a tuple with
  one element, but `(t)` to denote the tuple type with arity 1

## Filter operators

* `!`, `&&`, `||`: logical connectives NOT, AND and OR

* `>=`, `<=`: comparison operators; if applied to `String`s,
values are compared lexicographically

* `==`, `!=`: equality, inequality; note that the equality operator is
special when used at the top level of a condition (see below for
Builtin predicates); equality for strings is __case sensitive__.

* `=~`: "substring", returns true if the right hand side occurs as a
  substring of the left hand side; both arguments must be `String`s.
  Substring is __case insensitive__.

* `~=`: "reversed substring", returns true if the left hand side is a substring
  of the right hand side
  
* `contains(array, elem)`: array containment; returns true if at least
  one element of the array compares equal (according to `==`) to the passed
  element

* `in_array(elem, array)`: reversed array containment

* `starts_with(string, prefix)`, `ends_with(string, suffix)`, `prefix_of(prefix, string)`, `suffix_of(suffix, string)`: returns true if `prefix` is a case-insensitive prefix (resp. suffix) of `string`

## Literal value syntax

* `$undefined`: the value is unspecified and must be slot filled

* `$event`: the description of the last result

* `$event.type`: the type (function identifier) of the last result

* `$event.program_id`: the current program id

* `enum(x)`: the enumerated value x (e.g. `enum(on)` or `enum(off)`)

* `makeDate()`: current time (of type `Date`)

* `makeDate(yyyy, mm, dd, HH, MM, SS)`: the specified time; `HH`, `MM` and `SS` can be omitted

* `makeDate(unix_timestamp)`: unix timestamp in milliseconds since the epoch

* `date [+-] offset`: relative date; offset is a literal of `Measure(ms)` type; e.g. `makeDate() - 1h` = "1 hour ago"

* `start_of(hour|day|week|month|year)`, `end_of(hour|day|week|month|year)`: relative date; e.g. `start_of(day)` = "today" (at midnight)

* `true`/`false`: boolean

* number followed by unit: `Measure` literal; space is not allowed between the number and the unit

* `makeCurrency(num, code)`: `Currency` literal; `code` is the 3 letter currency code, lowercase; e.g. `makeCurrency(25, usd)`

* `makeTime(hour, minute, second)`: `Time` literal; `second` can be omitted and defaults to 0

* `makeLocation(lat, lon, display)`: `Location` literal; `display` can be omitted

* `$context.location.home`, `$context.location.work`, `$context.location.current_location`: predefined locations

* `"..."`: `String` literal

* `"..."^^type`, `"..."^^type("display")`: `Entity` literal

* `[...]`: `Array` literal

## Builtin Triggers

* `timer(base : Date, interval : Measure(ms))`: interval timer

* `attimer(time : Time)`: daily timer, fires at the given time

## Units of Measure

The following units are valid for the type `Measure(...)`:

* `ms`: time (milliseconds)
* `m`: distance (meters)
* `mps`: speed (meters per second)
* `kg`: mass (kilograms)
* `Pa`: pressure (Pascal)
* `C`: temperature (Celsius)
* `kcal`: energy (kilocalories)
* `byte`: data size (Byte)

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
| `KB` (1000 bytes)                 | `byte`    | data size         |
| `KiB` (1024 bytes)                | `byte`    | data size         |
| `MB` (1000 KB)                    | `byte`    | data size         |
| `MiB` (1024KiB)                   | `byte`    | data size         |
| `GB` (1000 MB)                    | `byte`    | data size         |
| `GiB` (1024 MiB)                  | `byte`    | data size         |
| `TB` (1000 GB)                    | `byte`    | data size         |
| `TiB` (1024 GiB)                  | `byte`    | data size         |

