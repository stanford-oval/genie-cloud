"use strict";
$(() => {
    const iconCdn = document.body.dataset.iconCdn;
    $('.device-selector').each((i, el) => {
        const $this = $(el);
        console.log($this);

        $('.fallback', $this).hide();
        const realInput = $('.fallback input', $this);

        const chosenDevices = new Set;

        const selectedBox = $('.selected-devices', $this);
        const addNewBox = $('.add-new-devices', $this);

        function makeSelectedDeviceEntry(device) {
            const box = $('<li>').attr('href', '#').addClass('list-group-item');
            const icon = $('<img>')
                .attr('src', iconCdn + '/icons/' + device.primary_kind + '.png')
                .attr('alt', 'Icon for ' + device.name)
                .addClass('device-icon-tiny');
            box.append(icon);
            const remove = $('<button type="button" class="btn btn-sm btn-default pull-right" aria-label="Remove"><span class="glyphicon glyphicon-remove"></span></button>');
            remove.on('click', (event) => {
                event.preventDefault();
                chosenDevices.delete(device.primary_kind);
                realInput.val(Array.from(chosenDevices).join(' '));
                box.remove();
            });
            box.append(remove);

            const name = $('<span>').text(device.name);
            box.append(name);

            return box;
        }

        const searchBar = $('.search-bar', $this);
        searchBar.on('input', () => {
            const searchKey = searchBar.val();
            if (searchKey.length < 3) {
                addNewBox.empty();
                return;
            }

            $.ajax('/thingpedia/api/v3/devices/search', {
                data: { q: searchKey },
                method: 'GET'
            }).then((result) => {
                addNewBox.empty();
                for (let device of result.data) {
                    const deviceChoice = $('<a>').attr('href', '#').addClass('list-group-item');

                    const icon = $('<img>')
                        .attr('src', iconCdn + '/icons/' + device.primary_kind + '.png')
                        .attr('alt', 'Icon for ' + device.name)
                        .addClass('device-icon-tiny');
                    deviceChoice.append(icon);
                    const name = $('<span>').text(device.name);
                    deviceChoice.append(name);

                    deviceChoice.on('click', (event) => {
                        event.preventDefault();
                        searchBar.val('');
                        addNewBox.empty();
                        if (chosenDevices.has(device.primary_kind))
                            return;

                        chosenDevices.add(device.primary_kind);
                        realInput.val(Array.from(chosenDevices).join(' '));
                        selectedBox.append(makeSelectedDeviceEntry(device));
                    });

                    addNewBox.append(deviceChoice);
                }
            }).catch((e) => console.error(e));
        });
    });
});
