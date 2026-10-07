package com.calendar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

@Entity
@Table(name = "holidays")
public class Holiday {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private int year;

    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(nullable = false)
    private String name;

    protected Holiday() {
    }

    public Holiday(LocalDate date, String name) {
        this.year = date.getYear();
        this.date = date;
        this.name = name;
    }

    public int getYear() {
        return year;
    }

    public LocalDate getDate() {
        return date;
    }

    public String getName() {
        return name;
    }
}
