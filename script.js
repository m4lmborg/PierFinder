// TfL API credentials
const TFL_APP_ID = '3cf952fb5ed44e6db67c76db42e75c23';
const TFL_APP_KEY = '30ed2e67d79f43c2989a63c26bf88644';

// Using the direct stop point IDs
const pierStopPoints = {
    'bankside': '930GSWK',         // Bankside Pier
    'barking_riverside': '930GBRVS', // Barking Riverside Pier
    'battersea': '930GBSP',        // Battersea Power Station Pier
    'canary_wharf': '930GCAW',     // Canary Wharf Pier
    'chelsea_harbour': '930GCHP',   // Chelsea Harbour Pier
    'embankment': '930GEMB',       // Embankment Pier
    'greenland': '930GGLP',        // Greenland (Surrey Quays) Pier
    'greenwich': '930GGNW',        // Greenwich Pier
    'london_bridge': '930GLBR',    // London Bridge City Pier
    'london_eye': '930GWMP',       // London Eye (Waterloo) Pier
    'masthouse_terrace': '930GMHT', // Masthouse Terrace Pier
    'millbank': '930GMBK',         // Millbank Pier
    'north_greenwich': '930GMIL',  // North Greenwich Pier
    'putney': '930GPUT',           // Putney Pier
    'royal_wharf': '930GWRF',      // Royal Wharf Pier
    'tower': '930GTMP',            // Tower Pier
    'vauxhall': '930GSGW',         // St George Wharf Pier (Vauxhall)
    'wandsworth': '930GWRQ',       // Wandsworth Riverside Quarter Pier
    'westminster': '930GWMR',      // Westminster Pier
    'woolwich': '930GWAS'          // Woolwich Royal Arsenal Pier
};

// Pier coordinates mapping
const pierCoordinates = {
    'barking_riverside': { lat: 51.51444, lon: 0.12778 },
    'woolwich': { lat: 51.497, lon: 0.0685 },
    'royal_wharf': { lat: 51.502369, lon: 0.033305 },
    'north_greenwich': { lat: 51.500182, lon: 0.008768 },
    'greenwich': { lat: 51.483334, lon: -0.009722 },
    'masthouse_terrace': { lat: 51.486944, lon: -0.0175 },
    'greenland': { lat: 51.486111, lon: -0.034722 },
    'canary_wharf': { lat: 51.504722, lon: -0.028333 },
    'tower': { lat: 51.505278, lon: -0.074722 },
    'london_bridge': { lat: 51.506389, lon: -0.085556 },
    'bankside': { lat: 51.507222, lon: -0.094444 },
    'embankment': { lat: 51.507222, lon: -0.122222 },
    'westminster': { lat: 51.501111, lon: -0.124167 },
    'london_eye': { lat: 51.503611, lon: -0.119444 },
    'millbank': { lat: 51.494167, lon: -0.127778 },
    'vauxhall': { lat: 51.485556, lon: -0.127778 },
    'battersea': { lat: 51.481667, lon: -0.144444 },
    'chelsea_harbour': { lat: 51.475, lon: -0.178889 },
    'wandsworth': { lat: 51.468611, lon: -0.190556 },
    'putney': { lat: 51.466944, lon: -0.216944 }
};

const STATUS_CLASSES = ['status-idle', 'status-good', 'status-warning', 'status-alert'];
let isUpdatingTimes = false;

async function fetchWithAuth(url) {
    const urlWithAuth = new URL(url);
    urlWithAuth.searchParams.append('app_id', TFL_APP_ID);
    urlWithAuth.searchParams.append('app_key', TFL_APP_KEY);

    console.log('Fetching from URL:', urlWithAuth.toString());

    const response = await fetch(urlWithAuth);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function fetchTimetable(stopPointId) {
    try {
        console.log('Fetching arrivals for stop point:', stopPointId);
        const arrivals = await fetchWithAuth(`https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`);
        console.log('Arrivals response:', arrivals);

        if (arrivals && arrivals.length > 0) {
            return arrivals.sort((a, b) =>
                new Date(a.expectedArrival) - new Date(b.expectedArrival)
            );
        }

        console.log('No arrivals found, fetching river bus lines');
        const lines = await fetchWithAuth('https://api.tfl.gov.uk/Line/Mode/river-bus');
        console.log('River bus lines:', lines);

        const timetablePromises = lines.map(line =>
            fetchWithAuth(`https://api.tfl.gov.uk/Line/${line.id}/Timetable/${stopPointId}`)
            .catch(error => {
                console.log(`No timetable for line ${line.id} at stop ${stopPointId}`);
                return null;
            })
        );

        const timetables = await Promise.all(timetablePromises);
        const validTimetables = timetables.filter(t => t !== null);

        console.log('Timetables for', stopPointId, ':', validTimetables);

        const now = new Date();
        const scheduledArrivals = [];

        validTimetables.forEach(timetable => {
            if (timetable && timetable.timetable && timetable.timetable.routes) {
                timetable.timetable.routes.forEach(route => {
                    route.stationIntervals?.forEach(interval => {
                        interval.intervals?.forEach(time => {
                            const [hours, minutes] = time.split(':').map(Number);
                            const arrivalTime = new Date(now);
                            arrivalTime.setHours(hours, minutes, 0);

                            if (arrivalTime < now) {
                                arrivalTime.setDate(arrivalTime.getDate() + 1);
                            }

                            scheduledArrivals.push({
                                expectedArrival: arrivalTime.toISOString(),
                                timeToStation: Math.floor((arrivalTime - now) / 1000),
                                destinationName: route.name,
                                platformName: interval.platformName || '',
                                lineId: timetable.lineId
                            });
                        });
                    });
                });
            }
        });

        return scheduledArrivals.sort((a, b) =>
            new Date(a.expectedArrival) - new Date(b.expectedArrival)
        );

    } catch (error) {
        console.error('Error fetching data:', error);
        throw error;
    }
}

function createTimeItem(time, destination, eta, serviceLine, isDelayed = false, isArriving = false) {
    const timeItem = document.createElement('div');
    timeItem.className = `time-item${isDelayed ? ' delayed' : ''}${isArriving ? ' arriving' : ''}`;

    const boatIcon = document.createElement('div');
    boatIcon.className = 'boat-icon';
    boatIcon.innerHTML = '<i class="fas fa-ship"></i>';

    const timeInfo = document.createElement('div');
    timeInfo.className = 'time-info';

    const timeText = document.createElement('div');
    timeText.className = 'time';
    timeText.innerHTML = `${time} <span class="service-line">${serviceLine || 'RB'}</span>`;

    const destinationText = document.createElement('div');
    destinationText.className = 'destination';
    destinationText.textContent = destination || 'Destination TBC';

    timeInfo.appendChild(timeText);
    timeInfo.appendChild(destinationText);

    const etaText = document.createElement('div');
    etaText.className = 'eta';
    etaText.textContent = eta;

    timeItem.appendChild(boatIcon);
    timeItem.appendChild(timeInfo);
    timeItem.appendChild(etaText);

    return timeItem;
}

function setLoadingState(isLoading) {
    const loadingState = document.getElementById('loading-state');
    const refreshButton = document.getElementById('refresh-btn');

    if (loadingState) {
        loadingState.classList.toggle('hidden', !isLoading);
    }

    if (refreshButton) {
        refreshButton.disabled = isLoading;
    }
}

function applyStatusClass(element, statusKey) {
    if (!element) return;
    STATUS_CLASSES.forEach(cls => element.classList.remove(cls));
    const className = STATUS_CLASSES.includes(`status-${statusKey}`) ? `status-${statusKey}` : 'status-idle';
    element.classList.add(className);
}

function updateStatusMessaging(message, statusKey = 'idle') {
    const serviceStatus = document.getElementById('service-status');
    const heroStatus = document.getElementById('hero-status');

    if (serviceStatus) {
        applyStatusClass(serviceStatus, statusKey);
        serviceStatus.textContent = message;
    }

    if (heroStatus) {
        heroStatus.textContent = message;
    }
}

function formatMinutesLabel(minutes) {
    if (minutes <= 0) return 'due now';
    if (minutes === 1) return 'in 1 minute';
    return `in ${minutes} minutes`;
}

function minutesUntil(arrival) {
    if (!arrival) return null;
    const expected = new Date(arrival.expectedArrival);
    const diffMs = expected.getTime() - Date.now();
    const minutes = Math.round(diffMs / 60000);
    return Math.max(0, minutes);
}

function formatEtaLabel(minutes) {
    if (minutes === null || minutes === undefined) return 'TBC';
    if (minutes <= 0) return 'Due';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
}

function createHighlightItem(text) {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
}

function updateHighlights(eastbound, westbound, pier) {
    const highlightList = document.getElementById('service-highlights');
    const totalServices = (eastbound?.length || 0) + (westbound?.length || 0);
    const summaryDefaults = {
        statusKey: 'idle',
        message: 'Select a pier to see departures',
        soonest: null,
        soonestDirection: null,
        lines: [],
        totalServices,
        eastboundCount: eastbound?.length || 0,
        westboundCount: westbound?.length || 0
    };

    if (!highlightList) {
        return summaryDefaults;
    }

    highlightList.innerHTML = '';

    if (!pier) {
        highlightList.appendChild(createHighlightItem('Pick a pier to see headline updates for your next sailing.'));
        return summaryDefaults;
    }

    const eastNext = eastbound[0];
    const westNext = westbound[0];
    const availableServices = [...eastbound, ...westbound];

    if (availableServices.length === 0) {
        highlightList.appendChild(createHighlightItem('We can’t see any live departures right now. Try refreshing or selecting a nearby pier.'));
        return {
            statusKey: 'warning',
            message: 'No live departures detected',
            soonest: null,
            soonestDirection: null,
            lines: [],
            totalServices: 0,
            eastboundCount: 0,
            westboundCount: 0
        };
    }

    const soonest = availableServices.reduce((acc, item) => {
        if (!acc) return item;
        return new Date(item.expectedArrival) < new Date(acc.expectedArrival) ? item : acc;
    }, null);
    const soonestMinutes = minutesUntil(soonest);
    const uniqueLines = [...new Set(availableServices.map(service => service.lineId?.toUpperCase()).filter(Boolean))];
    const soonestDirection = eastbound.includes(soonest)
        ? 'Eastbound'
        : westbound.includes(soonest)
            ? 'Westbound'
            : null;

    if (eastNext) {
        const mins = minutesUntil(eastNext);
        const destination = eastNext.destinationName || 'eastbound service';
        highlightList.appendChild(
            createHighlightItem(`Next eastbound heads to ${destination} ${formatMinutesLabel(mins)}.`)
        );
    }

    if (westNext) {
        const mins = minutesUntil(westNext);
        const destination = westNext.destinationName || 'westbound service';
        highlightList.appendChild(
            createHighlightItem(`Next westbound is bound for ${destination} ${formatMinutesLabel(mins)}.`)
        );
    }

    const directionSummary = [];
    if (eastbound.length > 0) {
        directionSummary.push(`${eastbound.length} eastbound`);
    }
    if (westbound.length > 0) {
        directionSummary.push(`${westbound.length} westbound`);
    }
    const directionText = directionSummary.length ? ` (${directionSummary.join(' • ')})` : '';

    highlightList.appendChild(
        createHighlightItem(`Tracking ${availableServices.length} upcoming ${availableServices.length === 1 ? 'departure' : 'departures'}${directionText}. Refreshed every 30 seconds.`)
    );

    let statusKey = 'good';
    let message = 'Departures on the horizon';

    if (soonestMinutes <= 5) {
        message = 'Boats arriving shortly';
    } else if (soonestMinutes <= 15) {
        message = 'Departures within 15 minutes';
    } else if (soonestMinutes <= 30) {
        message = 'Next sailings in under 30 minutes';
    } else if (soonestMinutes <= 60) {
        statusKey = 'warning';
        message = 'Next departures are a little while away';
    } else {
        statusKey = 'alert';
        message = 'Departures scheduled later today';
    }

    return {
        statusKey,
        message,
        soonest,
        soonestDirection,
        lines: uniqueLines,
        totalServices: availableServices.length,
        eastboundCount: eastbound.length,
        westboundCount: westbound.length
    };
}

function updateHeroSnapshot(pier, snapshot = {}) {
    const lineElement = document.getElementById('hero-next-line');
    const destinationElement = document.getElementById('hero-next-destination');
    const countdownElement = document.getElementById('hero-next-countdown');
    const directionElement = document.getElementById('hero-next-direction');
    const routesContainer = document.getElementById('hero-routes');
    const serviceCountElement = document.getElementById('hero-service-count');

    if (!lineElement || !destinationElement || !countdownElement || !routesContainer || !serviceCountElement) {
        return;
    }

    const {
        soonest = null,
        soonestDirection = null,
        lines = [],
        totalServices = 0,
        eastboundCount = 0,
        westboundCount = 0
    } = snapshot;

    const resetRoutes = (text) => {
        routesContainer.innerHTML = '';
        const chip = document.createElement('span');
        chip.className = 'route-chip placeholder';
        chip.textContent = text;
        routesContainer.appendChild(chip);
    };

    if (!pier) {
        lineElement.textContent = '--';
        destinationElement.textContent = 'Select a pier to see destinations.';
        countdownElement.textContent = '--';
        if (directionElement) {
            directionElement.classList.add('hidden');
        }
        serviceCountElement.textContent = 'Choose a pier to start tracking departures.';
        resetRoutes('RB routes will appear here');
        return;
    }

    const pierOption = document.querySelector(`#pier-select option[value="${pier}"]`);
    const pierName = pierOption ? pierOption.textContent : 'your pier';

    if (totalServices > 0) {
        const directionSummary = [];
        if (eastboundCount > 0) {
            directionSummary.push(`${eastboundCount} eastbound`);
        }
        if (westboundCount > 0) {
            directionSummary.push(`${westboundCount} westbound`);
        }
        const directionText = directionSummary.length ? ` (${directionSummary.join(' • ')})` : '';
        serviceCountElement.textContent = `Tracking ${totalServices} upcoming departure${totalServices === 1 ? '' : 's'} from ${pierName}${directionText}.`;
    } else {
        serviceCountElement.textContent = `No live departures showing for ${pierName}.`;
    }

    if (soonest) {
        const lineId = soonest.lineId?.toUpperCase() || 'RB';
        lineElement.textContent = lineId;
        const destination = soonest.destinationName || 'Destination TBC';
        destinationElement.textContent = destination;
        const minutes = minutesUntil(soonest);
        countdownElement.textContent = formatEtaLabel(minutes);
        if (directionElement) {
            if (soonestDirection) {
                directionElement.textContent = soonestDirection;
                directionElement.classList.remove('hidden');
            } else {
                directionElement.classList.add('hidden');
            }
        }
    } else {
        lineElement.textContent = '--';
        destinationElement.textContent = 'Awaiting live schedule.';
        countdownElement.textContent = '—';
        if (directionElement) {
            directionElement.classList.add('hidden');
        }
    }

    routesContainer.innerHTML = '';
    if (lines && lines.length > 0) {
        lines.slice(0, 4).forEach(lineId => {
            const chip = document.createElement('span');
            chip.className = 'route-chip';
            chip.textContent = lineId;
            routesContainer.appendChild(chip);
        });
    } else {
        resetRoutes('Routes pending');
    }
}

async function updateTimes() {
    if (isUpdatingTimes) {
        return;
    }

    const pier = document.getElementById('pier-select').value;

    if (!pier) {
        ['eastbound', 'westbound'].forEach(direction => {
            const timesContainer = document.getElementById(`${direction}-times`);
            if (timesContainer) {
                timesContainer.innerHTML = '<p class="placeholder">Select a pier to see times</p>';
            }
        });
        const highlightInfo = updateHighlights([], [], null);
        updateHeroSnapshot(null, highlightInfo);
        updateStatusMessaging(highlightInfo.message || 'Departures on the horizon', highlightInfo.statusKey || 'idle');
        setLoadingState(false);
        return;
    }

    const stopPointId = pierStopPoints[pier];
    if (!stopPointId) {
        console.error('No stop point ID found for pier:', pier);
        updateStatusMessaging('We couldn’t map that pier. Try another.', 'alert');
        setLoadingState(false);
        return;
    }

    isUpdatingTimes = true;
    setLoadingState(true);

    try {
        console.log('Fetching timetable for pier:', pier, 'with stopPointId:', stopPointId);
        const scheduledArrivals = await fetchTimetable(stopPointId);

        if (!scheduledArrivals || scheduledArrivals.length === 0) {
            console.log('No scheduled services found for pier:', pier);
            ['eastbound', 'westbound'].forEach(direction => {
                const timesContainer = document.getElementById(`${direction}-times`);
                if (timesContainer) {
                    timesContainer.innerHTML = '<p class="placeholder">No scheduled services found</p>';
                }
            });
            const highlightInfo = updateHighlights([], [], pier);
            updateHeroSnapshot(pier, highlightInfo);
            updateStatusMessaging(highlightInfo.message, highlightInfo.statusKey || 'warning');
            return;
        }

        scheduledArrivals.forEach(arrival => {
            console.log('Scheduled arrival:', {
                platform: arrival.platformName,
                destination: arrival.destinationName,
                lineId: arrival.lineId,
                expectedArrival: arrival.expectedArrival,
                timeToStation: Math.floor(arrival.timeToStation / 60)
            });
        });

        const easternPiers = ['barking_riverside', 'woolwich', 'royal_wharf', 'north_greenwich', 'greenwich', 'masthouse_terrace'];
        const westernPiers = ['putney', 'wandsworth', 'chelsea_harbour', 'battersea', 'vauxhall', 'millbank', 'westminster'];
        const centralPiers = ['london_bridge', 'tower', 'canary_wharf', 'bankside', 'embankment', 'london_eye', 'greenland'];

        const isEasternPier = easternPiers.includes(pier);
        const isWesternPier = westernPiers.includes(pier);
        const isCentralPier = centralPiers.includes(pier);

        const isEasternDestination = dest => {
            dest = dest.toLowerCase();
            return dest.includes('woolwich') ||
                   dest.includes('greenwich') ||
                   dest.includes('barking') ||
                   dest.includes('royal wharf') ||
                   dest.includes('masthouse') ||
                   dest.includes('canary wharf') ||
                   dest.includes('surrey quays');
        };

        const isWesternDestination = dest => {
            dest = dest.toLowerCase();
            return dest.includes('westminster') ||
                   dest.includes('putney') ||
                   dest.includes('chelsea') ||
                   dest.includes('battersea') ||
                   dest.includes('wandsworth') ||
                   dest.includes('vauxhall') ||
                   dest.includes('millbank') ||
                   dest.includes('waterloo') ||
                   dest.includes('london eye');
        };

        let eastbound = scheduledArrivals.filter(arrival => {
            const dest = (arrival.destinationName || '').toLowerCase();
            const platform = (arrival.platformName || '').toLowerCase();
            const lineId = (arrival.lineId || '').toLowerCase();

            if (platform.includes('west')) return false;
            if (isWesternDestination(dest)) return false;

            if (isWesternPier) {
                return isEasternDestination(dest);
            }

            if (isEasternPier) {
                return isEasternDestination(dest) || platform.includes('east');
            }

            if (isCentralPier) {
                if (pier === 'greenland') {
                    if (isEasternDestination(dest)) return true;
                    if (isWesternDestination(dest)) return false;
                    return lineId === 'rb1' || platform.includes('east');
                }

                if (pier === 'london_eye') {
                    if (isEasternDestination(dest)) return true;
                    if (dest.includes('westminster')) return false;
                    return lineId === 'rb1' || platform.includes('east');
                }

                if (isEasternDestination(dest)) return true;
                if (isWesternDestination(dest)) return false;
                return platform.includes('east') ||
                       (lineId === 'rb1' && !platform.includes('west'));
            }

            return false;
        });

        let westbound = scheduledArrivals.filter(arrival => {
            const dest = (arrival.destinationName || '').toLowerCase();
            const platform = (arrival.platformName || '').toLowerCase();
            const lineId = (arrival.lineId || '').toLowerCase();

            if (platform.includes('east')) return false;
            if (isEasternDestination(dest)) return false;

            if (isEasternPier) {
                return isWesternDestination(dest);
            }

            if (isWesternPier) {
                return isWesternDestination(dest) || platform.includes('west');
            }

            if (isCentralPier) {
                if (pier === 'greenland') {
                    if (isWesternDestination(dest)) return true;
                    if (isEasternDestination(dest)) return false;
                    return lineId === 'rb2' || platform.includes('west');
                }

                if (pier === 'london_eye') {
                    if (isWesternDestination(dest)) return true;
                    if (dest.includes('greenwich')) return false;
                    return lineId === 'rb2' || platform.includes('west');
                }

                if (isWesternDestination(dest)) return true;
                if (isEasternDestination(dest)) return false;
                return platform.includes('west') ||
                       (lineId === 'rb2' && !platform.includes('east'));
            }

            return false;
        });

        if (eastbound.length === 0 && westbound.length === 0) {
            console.log('No direction detected, using line IDs');
            eastbound = scheduledArrivals.filter(arrival => arrival.lineId === 'rb1');
            westbound = scheduledArrivals.filter(arrival => arrival.lineId === 'rb2');
        }

        const highlightInfo = updateHighlights(eastbound, westbound, pier) || {};
        updateHeroSnapshot(pier, highlightInfo);

        const eastboundPreview = eastbound.slice(0, 3);
        const westboundPreview = westbound.slice(0, 3);

        const eastboundContainer = document.getElementById('eastbound-times');
        if (eastboundContainer) {
            if (eastboundPreview.length === 0) {
                eastboundContainer.innerHTML = '<p class="placeholder">No eastbound services scheduled</p>';
            } else {
                eastboundContainer.innerHTML = '';
                eastboundPreview.forEach(arrival => {
                    const minutes = minutesUntil(arrival);
                    const eta = formatEtaLabel(minutes);
                    const isArriving = minutes !== null && minutes <= 5;
                    const isDelayed = minutes !== null && minutes >= 30;
                    const timeItem = createTimeItem(
                        formatArrivalTime(arrival.expectedArrival),
                        arrival.destinationName,
                        eta,
                        arrival.lineId?.toUpperCase() || 'RB',
                        isDelayed,
                        isArriving
                    );
                    eastboundContainer.appendChild(timeItem);
                });
            }
        }

        const westboundContainer = document.getElementById('westbound-times');
        if (westboundContainer) {
            if (westboundPreview.length === 0) {
                westboundContainer.innerHTML = '<p class="placeholder">No westbound services scheduled</p>';
            } else {
                westboundContainer.innerHTML = '';
                westboundPreview.forEach(arrival => {
                    const minutes = minutesUntil(arrival);
                    const eta = formatEtaLabel(minutes);
                    const isArriving = minutes !== null && minutes <= 5;
                    const isDelayed = minutes !== null && minutes >= 30;
                    const timeItem = createTimeItem(
                        formatArrivalTime(arrival.expectedArrival),
                        arrival.destinationName,
                        eta,
                        arrival.lineId?.toUpperCase() || 'RB',
                        isDelayed,
                        isArriving
                    );
                    westboundContainer.appendChild(timeItem);
                });
            }
        }

        updateStatusMessaging(highlightInfo.message || 'Departures on the horizon', highlightInfo.statusKey || 'idle');

    } catch (error) {
        console.error('Error updating times:', error);
        ['eastbound', 'westbound'].forEach(direction => {
            const timesContainer = document.getElementById(`${direction}-times`);
            if (timesContainer) {
                timesContainer.innerHTML = '<p class="placeholder">We hit a snag fetching live data. Please try again.</p>';
            }
        });
        const highlightList = document.getElementById('service-highlights');
        if (highlightList) {
            highlightList.innerHTML = '';
            highlightList.appendChild(createHighlightItem('Live data is temporarily unavailable. Give it a moment and refresh.'));
        }
        updateHeroSnapshot(pier, {
            totalServices: 0,
            lines: [],
            eastboundCount: 0,
            westboundCount: 0,
            soonest: null,
            soonestDirection: null
        });
        updateStatusMessaging('Something went wrong fetching times', 'alert');
    } finally {
        setLoadingState(false);
        isUpdatingTimes = false;
    }
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistance(distance) {
    if (distance < 1) {
        return `${Math.round(distance * 1000)} metres`;
    }
    return `${distance.toFixed(1)} km`;
}

function findNearestPier(userLat, userLon) {
    let nearestPier = null;
    let shortestDistance = Infinity;

    for (const [pierId, coords] of Object.entries(pierCoordinates)) {
        const distance = calculateDistance(userLat, userLon, coords.lat, coords.lon);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestPier = pierId;
        }
    }

    return {
        pierId: nearestPier,
        distance: shortestDistance
    };
}

function findNearestPierToUser() {
    const nearestPierInfo = document.getElementById('nearest-pier-info');
    const nearestPierName = document.getElementById('nearest-pier-name');
    const nearestPierDistance = document.getElementById('nearest-pier-distance');

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const nearest = findNearestPier(latitude, longitude);

            if (!nearest.pierId) {
                alert('We could not determine a nearby pier. Please choose one manually.');
                return;
            }

            const option = document.querySelector(`option[value="${nearest.pierId}"]`);
            const pierName = option ? option.textContent : nearest.pierId;

            nearestPierName.textContent = pierName;
            nearestPierDistance.textContent = formatDistance(nearest.distance);
            nearestPierInfo.classList.remove('hidden');

            const pierSelect = document.getElementById('pier-select');
            pierSelect.value = nearest.pierId;
            updateTimes();
        },
        (error) => {
            console.error('Error getting location:', error);
            alert('Unable to get your location. Please make sure location services are enabled.');
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );
}

const bankHolidays2024 = [
    '2024-01-01',
    '2024-03-29',
    '2024-04-01',
    '2024-05-06',
    '2024-05-27',
    '2024-08-26',
    '2024-12-25',
    '2024-12-26'
];

function isBankHoliday(date) {
    const formattedDate = date.toISOString().split('T')[0];
    return bankHolidays2024.includes(formattedDate);
}

function updateTimeDisplay() {
    const now = new Date();

    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    const heroTime = document.getElementById('hero-time');
    if (heroTime) {
        heroTime.textContent = now.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    const dateElement = document.getElementById('current-date');
    if (dateElement) {
        dateElement.textContent = now.toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    const bankHolidayElement = document.getElementById('bank-holiday');
    if (bankHolidayElement) {
        if (isBankHoliday(now)) {
            bankHolidayElement.classList.remove('hidden');
        } else {
            bankHolidayElement.classList.add('hidden');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pierSelect = document.getElementById('pier-select');
    if (pierSelect) {
        pierSelect.addEventListener('change', updateTimes);
    }

    const findNearestButton = document.getElementById('find-nearest');
    if (findNearestButton) {
        findNearestButton.addEventListener('click', findNearestPierToUser);
    }

    const heroNearestButton = document.getElementById('find-nearest-hero');
    if (heroNearestButton) {
        heroNearestButton.addEventListener('click', findNearestPierToUser);
    }

    const infoButton = document.getElementById('location-info-btn');
    if (infoButton) {
        infoButton.addEventListener('click', () => {
            const locationInfo = document.getElementById('location-info');
            locationInfo.classList.toggle('hidden');
        });
    }

    const refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            updateTimes();
        });
    }

    updateTimeDisplay();
    updateTimes();

    setInterval(updateTimeDisplay, 1000);
    setInterval(updateTimes, 30000);
});

function formatArrivalTime(isoString) {
    return new Date(isoString).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
