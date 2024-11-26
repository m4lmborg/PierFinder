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
        // First try the arrivals endpoint
        console.log('Fetching arrivals for stop point:', stopPointId);
        const arrivals = await fetchWithAuth(`https://api.tfl.gov.uk/StopPoint/${stopPointId}/Arrivals`);
        console.log('Arrivals response:', arrivals);

        if (arrivals && arrivals.length > 0) {
            // Sort arrivals by time
            return arrivals.sort((a, b) => 
                new Date(a.expectedArrival) - new Date(b.expectedArrival)
            );
        }

        // If no arrivals, try getting the timetable
        console.log('No arrivals found, fetching river bus lines');
        const lines = await fetchWithAuth('https://api.tfl.gov.uk/Line/Mode/river-bus');
        console.log('River bus lines:', lines);
        
        // Get timetables for each line that serves this stop
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
        
        // Extract scheduled times from timetables
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
                            
                            // If the time has passed for today, set it for tomorrow
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
        
        // Sort by arrival time
        return scheduledArrivals.sort((a, b) => 
            new Date(a.expectedArrival) - new Date(b.expectedArrival)
        );
        
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

async function updateTimes() {
    const pier = document.getElementById('pier-select').value;
    console.log('Selected pier:', pier);

    if (!pier) {
        ['eastbound', 'westbound'].forEach(direction => {
            const timesContainer = document.getElementById(`${direction}-times`);
            timesContainer.innerHTML = '<p>Select a pier to see times</p>';
        });
        return;
    }

    const stopPointId = pierStopPoints[pier];
    if (!stopPointId) {
        console.error('No stop point ID found for pier:', pier);
        return;
    }

    console.log('Fetching timetable for pier:', pier, 'with stopPointId:', stopPointId);
    const scheduledArrivals = await fetchTimetable(stopPointId);
    
    if (!scheduledArrivals || scheduledArrivals.length === 0) {
        console.log('No scheduled services found for pier:', pier);
        ['eastbound', 'westbound'].forEach(direction => {
            const timesContainer = document.getElementById(`${direction}-times`);
            timesContainer.innerHTML = '<p>No scheduled services found</p>';
        });
        return;
    }

    // Log full arrival details for debugging
    scheduledArrivals.forEach(arrival => {
        console.log('Scheduled arrival:', {
            platform: arrival.platformName,
            destination: arrival.destinationName,
            lineId: arrival.lineId,
            expectedArrival: arrival.expectedArrival,
            timeToStation: Math.floor(arrival.timeToStation / 60) // Convert seconds to minutes
        });
    });

    // Define eastern and western piers
    const easternPiers = ['barking_riverside', 'woolwich', 'royal_wharf', 'north_greenwich', 'greenwich', 'masthouse_terrace'];
    const westernPiers = ['putney', 'wandsworth', 'chelsea_harbour', 'battersea', 'vauxhall', 'millbank', 'westminster'];
    const centralPiers = ['london_bridge', 'tower', 'canary_wharf', 'bankside', 'embankment', 'london_eye', 'greenland'];

    const isEasternPier = easternPiers.includes(pier);
    const isWesternPier = westernPiers.includes(pier);
    const isCentralPier = centralPiers.includes(pier);

    // Helper function to check if a destination is eastern/western
    const isEasternDestination = dest => {
        dest = dest.toLowerCase();
        return dest.includes('woolwich') || 
               dest.includes('greenwich') || 
               dest.includes('barking') || 
               dest.includes('royal wharf') ||
               dest.includes('masthouse') ||
               dest.includes('canary wharf') ||
               dest.includes('surrey quays');  // Added Surrey Quays as eastern
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
               dest.includes('waterloo') ||    // Added Waterloo (London Eye)
               dest.includes('london eye');    // Added London Eye explicitly
    };

    // Separate arrivals by direction with stricter rules
    let eastbound = scheduledArrivals.filter(arrival => {
        const dest = (arrival.destinationName || '').toLowerCase();
        const platform = (arrival.platformName || '').toLowerCase();
        const lineId = (arrival.lineId || '').toLowerCase();
        
        // If platform explicitly says west, it's not eastbound
        if (platform.includes('west')) return false;
        
        // If it's a western destination, it's not eastbound
        if (isWesternDestination(dest)) return false;

        // For western piers
        if (isWesternPier) {
            return isEasternDestination(dest);
        }
        
        // For eastern piers
        if (isEasternPier) {
            // Must be going to another eastern pier or have east in platform
            return isEasternDestination(dest) || platform.includes('east');
        }
        
        // For central piers
        if (isCentralPier) {
            // Special handling for Greenland (Surrey Quays)
            if (pier === 'greenland') {
                if (isEasternDestination(dest)) return true;
                if (isWesternDestination(dest)) return false;
                return lineId === 'rb1' || platform.includes('east');
            }

            // Special handling for London Eye
            if (pier === 'london_eye') {
                if (isEasternDestination(dest)) return true;
                if (dest.includes('westminster')) return false;
                return lineId === 'rb1' || platform.includes('east');
            }

            if (isEasternDestination(dest)) return true;
            if (isWesternDestination(dest)) return false;
            // If destination is central, use platform or line
            return platform.includes('east') || 
                   (lineId === 'rb1' && !platform.includes('west'));
        }

        // If we can't determine, don't include it
        return false;
    });

    let westbound = scheduledArrivals.filter(arrival => {
        const dest = (arrival.destinationName || '').toLowerCase();
        const platform = (arrival.platformName || '').toLowerCase();
        const lineId = (arrival.lineId || '').toLowerCase();
        
        // If platform explicitly says east, it's not westbound
        if (platform.includes('east')) return false;
        
        // If it's an eastern destination, it's not westbound
        if (isEasternDestination(dest)) return false;

        // For eastern piers
        if (isEasternPier) {
            return isWesternDestination(dest);
        }
        
        // For western piers
        if (isWesternPier) {
            // Must be going to another western pier or have west in platform
            return isWesternDestination(dest) || platform.includes('west');
        }
        
        // For central piers
        if (isCentralPier) {
            // Special handling for Greenland (Surrey Quays)
            if (pier === 'greenland') {
                if (isWesternDestination(dest)) return true;
                if (isEasternDestination(dest)) return false;
                return lineId === 'rb2' || platform.includes('west');
            }

            // Special handling for London Eye
            if (pier === 'london_eye') {
                if (isWesternDestination(dest)) return true;
                if (dest.includes('greenwich')) return false;
                return lineId === 'rb2' || platform.includes('west');
            }

            if (isWesternDestination(dest)) return true;
            if (isEasternDestination(dest)) return false;
            // If destination is central, use platform or line
            return platform.includes('west') || 
                   (lineId === 'rb2' && !platform.includes('east'));
        }

        // If we can't determine, don't include it
        return false;
    });

    // If we have no boats in either direction, try to determine based on line ID only
    if (eastbound.length === 0 && westbound.length === 0) {
        console.log('No direction detected, using line IDs');
        eastbound = scheduledArrivals.filter(arrival => arrival.lineId === 'rb1');
        westbound = scheduledArrivals.filter(arrival => arrival.lineId === 'rb2');
    }

    // Limit to next 2 boats in each direction
    eastbound = eastbound.slice(0, 2);
    westbound = westbound.slice(0, 2);

    // Update eastbound times
    const eastboundContainer = document.getElementById('eastbound-times');
    if (eastbound.length === 0) {
        eastboundContainer.innerHTML = '<p>No eastbound services scheduled</p>';
    } else {
        const eastboundHtml = eastbound.map(arrival => {
            const timeToStation = Math.floor(arrival.timeToStation / 60); // Convert seconds to minutes
            const countdown = timeToStation <= 0 ? 'Due' : 
                            timeToStation < 60 ? `${timeToStation} min` :
                            `${Math.floor(timeToStation / 60)}h ${timeToStation % 60}m`;
            
            return `
                <div class="time-entry">
                    <span class="time">${formatArrivalTime(arrival.expectedArrival)}</span>
                    <span class="countdown">${countdown}</span>
                    <span class="destination">to ${arrival.destinationName || 'Unknown destination'}</span>
                    <span class="service">${arrival.lineId?.toUpperCase() || ''}</span>
                </div>
            `;
        }).join('');
        eastboundContainer.innerHTML = eastboundHtml;
    }

    // Update westbound times
    const westboundContainer = document.getElementById('westbound-times');
    if (westbound.length === 0) {
        westboundContainer.innerHTML = '<p>No westbound services scheduled</p>';
    } else {
        const westboundHtml = westbound.map(arrival => {
            const timeToStation = Math.floor(arrival.timeToStation / 60); // Convert seconds to minutes
            const countdown = timeToStation <= 0 ? 'Due' : 
                            timeToStation < 60 ? `${timeToStation} min` :
                            `${Math.floor(timeToStation / 60)}h ${timeToStation % 60}m`;
            
            return `
                <div class="time-entry">
                    <span class="time">${formatArrivalTime(arrival.expectedArrival)}</span>
                    <span class="countdown">${countdown}</span>
                    <span class="destination">to ${arrival.destinationName || 'Unknown destination'}</span>
                    <span class="service">${arrival.lineId?.toUpperCase() || ''}</span>
                </div>
            `;
        }).join('');
        westboundContainer.innerHTML = westboundHtml;
    }
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

// Format distance in a human-readable way
function formatDistance(distance) {
    if (distance < 1) {
        return `${Math.round(distance * 1000)} meters`;
    }
    return `${distance.toFixed(1)} km`;
}

// Find nearest pier to given coordinates
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

// Get user's location and find nearest pier
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
            
            // Convert pier ID to display name
            const pierName = document.querySelector(`option[value="${nearest.pierId}"]`).textContent;
            
            // Update UI
            nearestPierName.textContent = pierName;
            nearestPierDistance.textContent = formatDistance(nearest.distance);
            nearestPierInfo.classList.remove('hidden');
            
            // Select the nearest pier in the dropdown
            document.getElementById('pier-select').value = nearest.pierId;
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

// UK Bank Holidays for 2024
const bankHolidays2024 = [
    '2024-01-01', // New Year's Day
    '2024-03-29', // Good Friday
    '2024-04-01', // Easter Monday
    '2024-05-06', // Early May Bank Holiday
    '2024-05-27', // Spring Bank Holiday
    '2024-08-26', // Summer Bank Holiday
    '2024-12-25', // Christmas Day
    '2024-12-26'  // Boxing Day
];

function isBankHoliday(date) {
    const formattedDate = date.toISOString().split('T')[0];
    return bankHolidays2024.includes(formattedDate);
}

function updateTimeDisplay() {
    const now = new Date();
    
    // Update time
    const timeElement = document.getElementById('current-time');
    timeElement.textContent = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Update date with day name
    const dateElement = document.getElementById('current-date');
    dateElement.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Check for bank holiday
    const bankHolidayElement = document.getElementById('bank-holiday');
    if (isBankHoliday(now)) {
        bankHolidayElement.classList.remove('hidden');
    } else {
        bankHolidayElement.classList.add('hidden');
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Update times when pier is selected
    document.getElementById('pier-select').addEventListener('change', updateTimes);
    
    // Add click handler for find nearest pier button
    document.getElementById('find-nearest').addEventListener('click', findNearestPierToUser);
    
    // Initial updates
    updateTimeDisplay();
    updateTimes();
    
    // Set up periodic updates
    setInterval(updateTimeDisplay, 1000);  // Update clock every second
    setInterval(updateTimes, 30000);      // Update boat times every 30 seconds
});

function formatArrivalTime(isoString) {
    return new Date(isoString).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });
}
