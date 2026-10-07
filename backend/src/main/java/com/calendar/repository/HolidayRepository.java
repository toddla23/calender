package com.calendar.repository;

import com.calendar.entity.Holiday;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface HolidayRepository extends JpaRepository<Holiday, Long> {

    List<Holiday> findByYearOrderByDateAsc(int year);

    @Modifying
    @Query("delete from Holiday h where h.year = :year")
    void deleteByYear(int year);
}
