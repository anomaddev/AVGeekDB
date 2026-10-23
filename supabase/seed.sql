insert into public.data_versions (version, notes, is_current) values ('2026.10.23-sample', 'SAMPLE data only', true);
-- SAMPLE rows only (is_sample = true). Real data loaded from dist/ once sources are provided.
insert into public.airports (ident, iata, icao, name, city, country, latitude, longitude, elevation_ft, type, is_sample) values
 ('SAMPLE-KJFK','JFK','KJFK','John F. Kennedy International Airport (SAMPLE)','New York','US',40.6398,-73.7789,13,'large_airport',true),
 ('SAMPLE-EGLL','LHR','EGLL','London Heathrow Airport (SAMPLE)','London','GB',51.4706,-0.4619,83,'large_airport',true),
 ('SAMPLE-RJTT','HND','RJTT','Tokyo Haneda Airport (SAMPLE)','Tokyo','JP',35.5523,139.78,35,'large_airport',true);
insert into public.airlines (iata, icao, name, callsign, country, active, is_sample) values
 ('UA','UAL','United Airlines (SAMPLE)','UNITED','US',true,true),
 ('BA','BAW','British Airways (SAMPLE)','SPEEDBIRD','GB',true,true),
 ('NH','ANA','All Nippon Airways (SAMPLE)','ALL NIPPON','JP',true,true);
insert into public.aircraft_types (icao_code, iata_code, manufacturer, model, engine_type, engine_count, wake_category, is_sample) values
 ('B77W','77W','Boeing','777-300ER (SAMPLE)','jet',2,'H',true),
 ('A359','359','Airbus','A350-900 (SAMPLE)','jet',2,'H',true),
 ('B38M','7M8','Boeing','737 MAX 8 (SAMPLE)','jet',2,'M',true);
-- SAMPLE airline hubs
insert into public.airline_hubs (airline_id, airport_id, is_primary)
select al.id, ap.id, v.is_primary
from (values ('BAW','EGLL',true), ('ANA','RJTT',true), ('UAL','KJFK',false)) as v(airline_icao, airport_icao, is_primary)
join public.airlines al on al.icao = v.airline_icao
join public.airports ap on ap.icao = v.airport_icao;
