package com.calendar.controller;

import com.calendar.dto.Dtos.HolidayDto;
import com.calendar.exception.ApiException;
import com.calendar.service.HolidayService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/holidays")
public class HolidayController {

    private final HolidayService holidays;

    public HolidayController(HolidayService holidays) {
        this.holidays = holidays;
    }

    @GetMapping
    public List<HolidayDto> list(@RequestParam int year) {
        if (year < 2000 || year > 2100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "year 범위가 올바르지 않습니다");
        }
        return holidays.getHolidays(year);
    }
}
