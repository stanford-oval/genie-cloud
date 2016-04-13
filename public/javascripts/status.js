$(function() {
    function LinkedList(data) {
        this.data = data;
        this.next = null;
    }

    function LinkedQueue() {
        this.head = null;
        this.tail = null;
        this.size = 0;
    }
    LinkedQueue.prototype.isEmpty = function() {
        return this.head === null;
    }
    LinkedQueue.prototype.push = function(data) {
        if (this.tail === null) {
            this.head = this.tail = new LinkedList(data);
        } else {
            this.tail.next = new LinkedList(data);
            this.tail = this.tail.next;
        }
        this.size ++;
    }
    LinkedQueue.prototype.shift = function() {
        if (this.head === null)
            throw new Error('Empty queue');
        var node = this.head;
        this.head = this.head.next;
        if (this.head === null)
            this.tail = null;
        this.size --;
        return node.data;
    }
    LinkedQueue.prototype.peekOldest = function() {
        if (this.head === null)
            return null;
        return this.head.data;
    }
    LinkedQueue.prototype.peekNewest = function() {
        if (this.tail === null)
            return null;
        return this.tail.data;
    }

    var previous = undefined;
    var messages = new LinkedQueue();

    var backoffTimer = 5000;
    var backoffMsgCount = 0;

    function startEventSource() {
        var cursor = null;
        if (messages.peekNewest()) {
            var newest = messages.peekNewest();
            cursor = newest.attr('data-cursor');
        }
        var eventSource = new EventSource('/status/logs' + (cursor ? ('?startCursor=' + encodeURIComponent(cursor)) : ''));

        backoffMsgCount = 0;
        eventSource.onerror = function() {
            eventSource.close();

            var oldbackoff = backoffTimer;
            backoffTimer *= 1.5;
            if (backoffTimer >= 76527504) // approx 21h
                backoffTimer = 76527504;

            setTimeout(function() {
                startEventSource();
            }, oldbackoff);
        }

        eventSource.onmessage = function(e) {
            backoffMsgCount ++;
            if (backoffMsgCount >= 3)
                backoffTimer = 5000;

            try {
                var parsed = JSON.parse(e.data);
            } catch(e) {
                console.log('Failed to parse server event: ' + e.message);
                return;
            }

            if (messages.size >= 100) {
                var oldP = messages.shift();
                oldP.remove();
            }

            var container = $('#log-view');

            var date = new Date(parsed.__REALTIME_TIMESTAMP/1000);

            if (previous !== undefined &&
                previous !== parsed.THINGENGINE_PID) {
                var restarted = $('<p>' + date.toLocaleString() +
                                  ': <strong>*** Restarted ***</strong></p>');
                container.append(restarted);
                messages.push(restarted);
            }
            previous = parsed.THINGENGINE_PID;

            var newP = $(document.createElement('p'));
            if (parsed.PRIORITY <= 3)
                newP.addClass('text-danger');
            else if (parsed.PRIORITY <= 4)
                newP.addClass('text-warning');

            newP.text(date.toLocaleString() + ': ' + parsed.MESSAGE);
            newP.attr('data-cursor', parsed.__CURSOR);

            container.append(newP);
            messages.push(newP);
        }
    }

    $('#log-view').each(function() {
        startEventSource();
    });
});
