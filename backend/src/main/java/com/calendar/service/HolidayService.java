package com.calendar.service;

import com.calendar.dto.Dtos.HolidayDto;
import com.calendar.entity.Holiday;
import com.calendar.repository.HolidayRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 공공데이터포털 특일 정보 API(getRestDeInfo)를 백엔드가 연 단위로 가져와 DB에 캐싱한다.
 * 클라이언트는 API 키를 알 필요가 없고, 외부 API 장애가 앱 전체에 영향을 주지 않는다.
 */
@Service
public class HolidayService {

    private static final Logger log = LoggerFactory.getLogger(HolidayService.class);
    private static final String ENDPOINT =
            "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
    private static final DateTimeFormatter LOCDATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final HolidayRepository holidays;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final RestClient http = RestClient.create();
    private final String serviceKey;

    public HolidayService(HolidayRepository holidays, JdbcTemplate jdbc, TransactionTemplate tx,
                          ObjectMapper mapper, @Value("${calendar.holidays.service-key}") String serviceKey) {
        this.holidays = holidays;
        this.jdbc = jdbc;
        this.tx = tx;
        this.mapper = mapper;
        this.serviceKey = serviceKey;
    }

    public List<HolidayDto> getHolidays(int year) {
        if (!isFetched(year)) {
            refresh(year);
        }
        return holidays.findByYearOrderByDateAsc(year).stream()
                .map(h -> new HolidayDto(h.getDate(), h.getName())).toList();
    }

    /** 매년 1월 1일 03:00 — 올해와 내년 공휴일을 다시 가져온다. */
    @Scheduled(cron = "0 0 3 1 1 *")
    public void refreshYearly() {
        int year = LocalDate.now().getYear();
        refresh(year);
        refresh(year + 1);
    }

    /** 외부 API 호출이 성공했을 때만 캐시를 교체한다. 실패하면 기존 캐시를 유지한다. */
    public void refresh(int year) {
        if (serviceKey == null || serviceKey.isBlank()) {
            log.warn("calendar.holidays.service-key가 없어 {}년 공휴일을 가져오지 못했습니다", year);
            return;
        }
        List<Holiday> fetched;
        try {
            fetched = fetch(year);
        } catch (Exception e) {
            log.warn("{}년 공휴일 조회 실패: {}", year, e.getMessage());
            return;
        }
        tx.executeWithoutResult(status -> {
            holidays.deleteByYear(year);
            holidays.saveAll(fetched);
            jdbc.update("""
                    INSERT INTO holiday_years (year, fetched_at) VALUES (?, UTC_TIMESTAMP(6))
                    ON DUPLICATE KEY UPDATE fetched_at = UTC_TIMESTAMP(6)""", year);
        });
        log.info("{}년 공휴일 {}건 캐싱", year, fetched.size());
    }

    private boolean isFetched(int year) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM holiday_years WHERE year = ?", Integer.class, year);
        return n != null && n > 0;
    }

    private List<Holiday> fetch(int year) throws Exception {
        // serviceKey는 이미 URL 인코딩된 상태로 발급되므로 이중 인코딩을 피한다
        URI uri = UriComponentsBuilder.fromUriString(ENDPOINT)
                .queryParam("serviceKey", serviceKey)
                .queryParam("solYear", year)
                .queryParam("numOfRows", 100)
                .queryParam("_type", "json")
                .build(true).toUri();
        String body = http.get().uri(uri).retrieve().body(String.class);

        JsonNode root = mapper.readTree(body);
        String resultCode = root.path("response").path("header").path("resultCode").asText();
        if (!"00".equals(resultCode)) {
            throw new IllegalStateException("API 응답 코드 " + resultCode);
        }

        // item은 0건이면 "", 1건이면 객체, 여러 건이면 배열로 내려온다
        JsonNode item = root.path("response").path("body").path("items").path("item");
        List<JsonNode> nodes = new ArrayList<>();
        if (item.isArray()) {
            item.forEach(nodes::add);
        } else if (item.isObject()) {
            nodes.add(item);
        }

        List<Holiday> result = new ArrayList<>();
        for (JsonNode n : nodes) {
            if (!"Y".equals(n.path("isHoliday").asText())) {
                continue;
            }
            LocalDate date = LocalDate.parse(n.path("locdate").asText(), LOCDATE);
            result.add(new Holiday(date, n.path("dateName").asText()));
        }
        return result;
    }
}
