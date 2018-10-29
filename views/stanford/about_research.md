:::::: {.divider}
### Our Mission

The mission of the Almond project is to research open virtual assistant technology through a
collaborative effort between academia and industry, in concert with the creation of a
distributed virtual assistant infrastructure to safeguard privacy.

Virtual assistants are revolutionizing the digital interface by giving us a uniform, personalized,
linguistic user interface (LUI) to our diverse digital data, IoT, and web assets.
In the future, they can perform custom, complex digital tasks, interface with humans,
provide emotional support, and advise on personal fitness, finance, education, career, and so on.

The research of understanding how the digital world operates and how to interface with it is a tremendous undertaking.
Besides the technical challenges,  it also requires crowdsourcing huge knowledge bases such as the
catalog of all the digital interfaces, natural language utterances, and behavioral data.
This lab serves as a neutral party to bring together companies with academia, to create open,
non-proprietary, production-quality resources to facilitate basic research and technology transfer.

Virtual assistants can reverse today’s Big Brother trend where companies owning massive volumes of
private data can exert overwhelming influences on a large population.
Virtual assistants can be programmed in natural language, reducing their reliance on third-party developers.
What we need is to establish a commercially viable infrastructure of distributed virtual assistants
early to give consumers a healthy choice of vendors, including the option to keep data on their devices.

::::::
:::::: {.divider}
### Compound, Event-Driven Commands

:::: {.row}
::: {.col-md-6 #multi-color-example}
<p class="box">
<span class="black">When the</span>
<span class="blue">Bitcoin</span>
<span class="red">price reaches $20,000</span>
<span class="black">,</span>
<span class="blue">search for</span>
<span class="black">a</span>
<span class="purple">“Bitcoin”</span>
<span class="blue">picture</span>
<span class="black">, and</span>
<span class="blue">tweet</span>
<span class="green">it</span>
<span class="black">with</span>
<span class="purple">caption “I am rich!”</span>
</p>
<p class="arrow">⇓</p>
<p class="box">
<span class="black"><code>monitor</code></span>
<span class="blue">@bitcoin.get_price()</span>
<span class="black"><code>on</code></span>
<span class="red">price &ge; $20000</span>
<span class="black">⇒</span>
<span class="blue">@bing.image_search</span>
<span class="black">(</span>
<span class="purple">bitcoin"</span>
<span class="black">) ⇒</span>
<span class="blue">@twitter.post</span>
<span class="black">(</span>
<span class="green">@bing.picture</span>
<span class="black">,</span>
<span class="purple">I am rich!"</span>
<span class="black">)</span>
</p>
:::

::: {.col-md-6}
Virtual assistants become much more powerful and useful if users can compose primitive functions
together to create compound commands that run automatically.
For example, "Put all the most frequently played songs each week into a new playlist",
combines the retrieval of songs played with the creation of a playlist.
Similarly, "Send me email whenever my car is not plugged in at home"
combines querying the state of a car and sending email.
To handle the large number of possible combinations, we have created a virtual assistant programming
language, called ThingTalk, that can combine skills from <a href='/thingpedia'>Thingpedia</a>, an open-world repository.
:::
::::

::::::
:::::: {.divider}
### General, Fine-Grain Sharing with Privacy

:::: {.row}
::: {.col-md-6}
Sharing is broken today;  this is why the convenience of sharing via Facebook has driven billions
to give up ownership to their data.  Virtual assistants can transform how we share everything digital.
In our design, the virtual assistant handles all the sharing:
it accepts requests, gets approval from the owner, executes the requests, and returns only the requested results.
For generality and fine granularity, the request can be any ThingTalk program.
For privacy, the owner can specify what ThingTalk programs each person can execute, in natural language.
For example, a dad can tell his voice-activated virtual assistant that "Bobby can buy household goods that are under $20".
The assistant, upon recognizing Bobby’s voice, can enforce the constraint.
We extended ThingTalk to include specification of access control.

With this design, the owner is not constrained by the sharing options offered by the original service providers;
in fact, the requesters do not even need to join the same services.
With GDPR, individuals can get access to all their personal information in the cloud and share them at will.
:::

::: {.col-md-6}
![A dad can access the security camera of his daughter, until certain conditions specified by her.](https://almond-static.stanford.edu/assets/images/comma-security-camera-example.svg)
![The architecture of communicating virtual assistants.](https://almond-static.stanford.edu/assets/images/comma-arch.svg)
:::
::::

::::::
:::::: {.divider}
### Natural-language Programming Methodology

We model the natural language under-standing task in a LUI as a natural-language programming problem.
The family of acceptable utterances is defined as sentences matching the semantics of a target formal
programming language and its library of functions.  We have developed a methodology, inspired by Sempre,
to tune and refine the target grammar and library representation to derive effective semantic parsers.
After significant tuning of ThingTalk and Thingpedia, we show that state-of-the-art sequence-to-sequence
and transformer models perform well on 25,000 manually paraphrased compound commands, which will be released as an open dataset.

::::::
:::::: {.divider}
### Graphical Virtual Assistants

Limitations of textual display of results prompted us to extend natural-language programming to
generate graphical user interfaces (GUI) automatically, which is one or the most time-consuming tasks
in software development. GUIs are important for displaying graphical or lists of results, letting
users monitoring multiple queries, rerunning complex commands,and adjusting settings with different
modality.  We use machine learning to leverage existing GUIs and the artistic designs in masterpieces
to generate not just functional, but aesthetically pleasing, apps.

![Apply style transfer to virtual assistant GUI.](https://almond-static.stanford.edu/assets/images/style-transfer.png)

::::::
:::::: {.divider}
### Inter-Virtual Assistant Communication

:::: {.row}
::: {.col-md-6}
Today, the email SMTP protocol, despite its insecurity, is good at letting users share data stored
in different servers including their own.
We see adding secure communication to open virtual assistants as a great opportunity to create a
higher-level, more secure, privacy-honoring sharing capability.
Thus, we propose DTP, Distributed ThingTalk Protocol, to let assistants securely distribute ThingTalk
programs and return results. Using DTP, virtual assistants let users access each others’ data and
resources easily in a similar fashion as their own.
For example, instead of saying "Show me my security camera",
Ann’s father can simply say "Show me Ann's security camera", his virtual assistant can automatically
execute the command on Ann’s virtual assistant using DTP, provided Ann has given permission.
:::

::: {.col-md-6}
![Architecture of Communicating Virtual Assistants](https://almond-static.stanford.edu/assets/images/dtp-arch-diagram.png)
:::
::::

::::::
:::::: {.divider}
### Research Agenda

:::: {.row}
::: {.col-md-6 .hanging-icon-block #agenda-thingpedia}
#### Thingpedia
A non-proprietary repository of digital interfaces and their linguistic representation open to all
virtual assistant platforms.  Unlike existing skill repositories, Thingpedia captures the full API
signatures to support composition.  Plenty of research is still necessary to learn how to organize
the information, standardize across devices with similar functions, and reduce quirkiness of specific
interfaces to increase synthesizability from natural language.
Besides launching campaigns to crowdsource the data, we plan to use data programming techniques
to automate the acquisition of entries in Thingpedia.
Thingpedia will be extended to include also compound commands consumers find useful as well as
templates of personal data released under GDPR.
:::

::: {.col-md-6 .hanging-icon-block #agenda-thingtalk}
#### ThingTalk
A formal, synthesizable, virtual assistant programming language.  ThingTalk currently supports
composition of skills, event monitoring, access control, and distributed execution.
We plan to extend ThingTalk so (1) users can create custom tasks involving data-dependent decisions;
(2) users can query their data easily, hiding the complexity of retrieving data from different cloud services;
and (3) users can access and compute with data from their network of friends of friends.
:::
::::

:::: {.row}
::: {.col-md-6 .hanging-icon-block #agenda-luinet}
#### LUInet
Linguistic User Interface Neural Network, a neural network that understands natural language to code.
We hope to collect real-life data through our own apps and our partners products.
We also plan to refine the methodology to create new language discourses.
Companies can use this to let workers customize an assistant for their workflow using corporate
confidential APIs. Other research topics include automatically generating precise,
yet natural, sentences to confirm the  commands, as well as the automatic generation of dialogs
to help users discover the virtual assistant’s capabilities and to refine their commands.
:::

::: {.col-md-6 .hanging-icon-block #agenda-guinet}
#### GUInet
Graphical User Interface Neural Network, a neural network that translates natural language commands
into graphical interfaces.  We plan to improve our existing models and apply the idea to many more
applications.  We also plan to understand how we can combine LUI andGUI together to make the most
out of both types of interfaces.
:::
::::

::: {.hanging-icon-block #agenda-dtp}
#### Distributed ThingTalk Protocol
Distributed  ThingTalk  Protocol,  that  supports  sharing  with  privacy  via  cooperating virtual assistants.
e only have a rudimentary design to date;  we hope that this lab can bring the  major corporate players
together to define, evolve, and adopt a common virtual assistant communication protocol.
:::

::::::
:::::: {.divider}
### Projects in Progress

:::: {.row}
::: {.col-md-6 .hanging-icon-block #project-server}
#### Platform-agnostic Skill Server
Today, to reach Alexa and Google Assistant users, companies need to stand up a skill server to
interface between the assistants and their own services.  We see an opportunity to create a
platform-agnostic service that provides vendors with LUI technology that connects to different
platforms.  Such a service lowers the programming complexity for the vendors, while making their
skills readily available to other platforms, if desired.
:::

::: {.col-md-6 .hanging-icon-block #project-compound}
#### Privacy-preserving Compound Command Service
We plan to offer users an alternative to IFTTT, a web service that millions have used to automate
their IoTs.  Unlike IFTTT, our service provides a natural-language interface and allows users to
keep their credentials.
:::
::::

::: {.hanging-icon-block #project-email}
#### Natural-language Queries for Email Archives
We plan to add a natural-language interface to ePADD, an email browsing tool developed by
Stanford Library based on our research prototype Muse.
It is used by 35 libraries including the New York Public Library, Museum of ModernArt,
and libraries at Brown, Caltech, Harvard, MIT, UC Berkeley, UCLA.
We plan to compare the effectiveness of LUIs with GUIs, with the help of actual users in these libraries.
:::

::::::
