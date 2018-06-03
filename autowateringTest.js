//test parameters
SENSOR_CHECK_RATE = 1000;
SLENGTH = 10;
DEVICE_KEY = 'hardinero';

let parameters = {
    device_key: DEVICE_KEY,
    cropMoistureLimit: 0,
    cropHumidityLimit: 0,
    cropWateringFrequency: 360
}

let data = {
    weather: 'No Data',
    temperature: 0,
    humidity: 0,
    soilMoisture1: 0,
    soilMoisture2: 0,
    waterPumpOn: false,
    tankLevel: 0,
    lastWatering: 'No Data',
    device_key: parameters.device_key
}

//utility variables
let w_seconds_past = 0;
let w_activated = false;

//simulate_data
function simulateData(){
    console.log('Simulator Started...');
    setTimeout(()=>{
        console.log('Trigger...');
        
    },4000);
}

//utility functions
function activatePump() {
    let now = new Date();
    if (!data.waterPumpOn) {
        data.waterPumpOn = true;
        //gpios.rly_sw1.digitalWrite(1);
        //gpios.rly_sw2.digitalWrite(1);
        let now = new Date();
        data.lastWatering = (now.getMonth() + 1) + "/" + now.getDate() + '/' + now.getYear()
            + ' ' + now.getHours() + '-' + (now.getMinutes()) + '-' + (now.getSeconds());
        console.log('Pump Activated @' + data.lastWatering);
    }
}

function deactivatePump() {
    data.waterPumpOn = false;
    console.log('Pump Deactivated');
    //gpios.rly_sw1.digitalWrite(0);
    //gpios.rly_sw2.digitalWrite(0);
}

//auto watering routine
function initiateAutoWaterRoutine() {
    setInterval(function () {

        let n = new Date();
        let h = n.getHours();
        let m = n.getMinutes();
        let wfactor = 721;
        if(parameters.cropWateringFrequency == 1){
            wfactor = 721;
        }
        wfactor = Math.floor( 720 / (parameters.cropWateringFrequency - 1));


        if (parameters.cropMoistureLimit > 0 &&
            (data.soilMoisture1 < parameters.cropMoistureLimit ||
                (data.soilMoisture2 < parameters.cropMoistureLimit))) {
            //water moisture in critical levels
            activatePump();
        } else if (parameters.cropHumidityLimit > 0 &&
            data.humidity < parameters.cropHumidityLimit) {
            //atmosphere humidity in critical level
            activatePump();
        } else if (parameters.cropWateringFrequency > 0) {
            //watering frequency valid only from 6->18 (6am to 6pm)
            if (12 <= h && h <= 24) {
                let min_from_zero = ((h - 12) * 60 + m);
                console.log('mfz: ' + min_from_zero);
                if ((min_from_zero % wfactor) == 0 && w_activated == false) {
                    w_activated = true;
                    activatePump();
                }
                if (w_activated) {
                    w_seconds_past++;
                    if (w_seconds_past == SLENGTH) {
                        w_seconds_past = 0;
                        w_activated = false;
                        deactivatePump();
                    }
                }
            }
        } else {
            deactivatePump();
        }
    }, SENSOR_CHECK_RATE);
}

initiateAutoWaterRoutine();
simulateData();